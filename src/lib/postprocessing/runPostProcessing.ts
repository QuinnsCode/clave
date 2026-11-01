// src/lib/postprocessing/runPostProcessing.ts
//
// End-to-end post-processing for one peer's session recording.
// Produces four R2 artifacts and one D1 tracking row:
//
//   R2: {org}/{session}/{peer}/audio.webm        — assembled, re-encoded audio
//   R2: {org}/{session}/{peer}/waveform.dat      — waveform peaks (binary)
//   R2: {org}/{session}/{peer}/diarization.json  — full diarization (with raw)
//   R2: {org}/{session}/{peer}/timeline.json     — per-speaker clips + auto-markers
//   D1: session_diarization row                  — slim queryable copy
//
// Phases (today: SEQUENTIAL, structured for parallel later — see notes):
//
//   Phase 0: Ensure pod exists for session + INSERT D1 row (status: "running")
//            NEW (R1 pods pass) — auto-creates pod-of-1 if session has no podId
//   Phase 1: List + download chunks from R2          [chain — must be serial]
//   Phase 2: Assemble in container                   [single blocking call]
//   Phase 3: Independent post-assembly artifacts     [⚠ PARALLELIZATION SEAM]
//     3a. Write audio.webm to R2
//     3b. Write waveform.dat to R2 (if container generated it)
//     3c. Run diarization provider + write JSON + update D1
//     3d. Build + write timeline.json (per-speaker clips + markers)
//         Uses Phase 2's in-memory waveform + Phase 3c's diarization words.
//         Non-fatal — if it fails, audio/waveform/diarization remain saved.
//   Phase 4: Mark D1 row "done"
//
//   On any failure (other than 3d): mark "failed", rethrow.
//
// CHANGED (R1.5 fix) — pod auto-creation now calls `createPodService` (the
// pure service) instead of the `createPod` server action. The pipeline runs
// inside a queue consumer, NOT inside an HTTP request, so `requestInfo.ctx`
// is empty and the server action would reject with "unauthorized". The
// service trusts its inputs (we pass orgId explicitly) and works in any
// server-side context.

import { db } from "@/db";
import { getDiarizationProvider, type DiarizationResult } from "@/lib/diarization";
import type { DiarizationOpts } from "@/lib/diarization/types";
import {
  waveformKey as buildWaveformKey,
  parseWaveformHeader,
  headerBytesFor,
} from "@/lib/diarization/waveform";
import { groupWordsToUtterances } from "@/lib/diarization/utterances";
import {
  buildTimelineData,
  timelineKey as buildTimelineKey,
} from "@/lib/postprocessing/timeline";
// NEW (R1 pods pass) — pod auto-creation for sessions that arrive without one.
// CHANGED (R1.5 fix) — import the SERVICE, not the server action.
import { createPodService } from "@/lib/pods/podsService";

// ── R2 key helpers — mirror the recording plugin layout ─────────────────────

const audioChunkPrefix  = (o: string, s: string, p: string) => `${o}/${s}/${p}/audio/`;
const assembledAudioKey = (o: string, s: string, p: string) => `${o}/${s}/${p}/audio.webm`;
const diarizationKey    = (o: string, s: string, p: string) => `${o}/${s}/${p}/diarization.json`;

// ── Inputs / outputs ────────────────────────────────────────────────────────

export interface RunPostProcessingArgs {
  // Identity — all required, caller is responsible for sourcing these
  organizationId: string;
  siteKey:        string;
  sessionId:      string;
  peerId:         string;

  // Provider opts (back-compat path via vocabulary kept for now)
  diarizationOpts?: DiarizationOpts;
  vocabulary?:      string[];   // legacy — converted to diarizationOpts internally

  // NEW (R1 pods pass) — explicit pod assignment.
  // If provided AND the session log has no pod yet, attaches to this pod.
  // If omitted AND the session has no pod, a pod-of-1 is auto-created with
  // a random name. If the session already has a pod, this is ignored
  // (use assignSessionToPod server action to move sessions between pods).
  podId?: string;

  // Audit
  triggeredBy?: string;   // userId | "queue:auto" | "manual:curl"
}

export interface RunPostProcessingResult {
  ok:             true;
  diarizationId:  string;
  provider:       string;

  // Artifacts produced
  audioKey:       string;
  diarizationKey: string;
  waveformKey:    string | null;
  waveformPps:    string | null;
  timelineKey:    string | null;

  // NEW (R1 pods pass) — pod the session was attached to (may be just-created)
  podId:          string | null;

  // Summary stats
  chunkCount:     number;
  assembledBytes: number;
  waveformBytes:  number;
  speakerCount:   number;
  wordCount:      number;
  durationSec:    number | null;

  timings: {
    listMs:          number;
    downloadMs:      number;
    containerMs:     number;
    writeAudioMs:    number;
    writeWaveformMs: number;
    providerMs:      number;
    writeDiarMs:     number;
    writeTimelineMs: number;
    ensurePodMs:     number;   // NEW (R1 pods pass)
    totalMs:         number;
  };
}

// Env shape this function needs — narrow to just the bindings it touches.
interface PostProcessingEnv {
  RECORDING_BUCKET:  R2Bucket;
  DIARIZE_CONTAINER: DurableObjectNamespace;
  // Passed through to getDiarizationProvider:
  AI?: any;
  TRANSCRIPTION_AI?: any;
  DIARIZATION_PROVIDER?: string;
  XAI_API_KEY?: string;
  DEEPGRAM_API_KEY?: string;
}

// ── Main ────────────────────────────────────────────────────────────────────

export async function runPostProcessing(
  env:  PostProcessingEnv,
  args: RunPostProcessingArgs,
): Promise<RunPostProcessingResult> {
  const { organizationId, siteKey, sessionId, peerId, triggeredBy } = args;
  const jobId = `${sessionId}-${peerId}`;
  const startedAt = Date.now();

  // Resolve opts — prefer new diarizationOpts, fall back to legacy vocabulary.
  const diarizationOpts: DiarizationOpts =
    args.diarizationOpts ?? (args.vocabulary ? { vocabulary: args.vocabulary } : {});

  // ── Phase 0 (a): Ensure pod exists for this session ───────────────────────
  // NEW (R1 pods pass). Best-effort — wrapped in try/catch so a pod failure
  // doesn't block diarization. The pod can be self-healed later by the UI
  // (server actions or save-edit flows will create one lazily if needed).
  const ensurePodStart = Date.now();
  let resolvedPodId: string | null = null;
  try {
    resolvedPodId = await ensurePodForSession({
      organizationId,
      siteKey,
      sessionId,
      requestedPodId: args.podId ?? null,
    });
  } catch (podErr) {
    console.error(`[postproc:${jobId}] pod ensure failed (non-fatal):`, podErr);
    resolvedPodId = null;
  }
  const ensurePodMs = Date.now() - ensurePodStart;

  // ── Phase 0 (b): INSERT D1 row (status: "running") ────────────────────────
  // Resolve provider name eagerly so we can record it before the expensive
  // work begins — useful if something crashes mid-run.
  const provider = getDiarizationProvider(env as any);
  const diarizationId = await insertDiarizationRow({
    organizationId, siteKey, sessionId, peerId,
    providerName: provider.name,
    providerOpts: diarizationOpts,
    triggeredBy,
  });

  try {
    // ── Phase 1: List + download chunks ─────────────────────────────────────
    const listStart = Date.now();
    const chunkKeys = await listAudioChunks(env, organizationId, sessionId, peerId);
    const listMs = Date.now() - listStart;
    console.log(`[postproc:${jobId}] listed ${chunkKeys.length} chunks (${listMs}ms)`);

    const downloadStart = Date.now();
    const chunkBuffers = await downloadChunks(env, chunkKeys);
    const downloadMs = Date.now() - downloadStart;
    console.log(`[postproc:${jobId}] downloaded ${chunkBuffers.length} chunks (${downloadMs}ms)`);

    // ── Phase 2: Container assembly ─────────────────────────────────────────
    const containerStart = Date.now();
    const assembly = await assembleInContainer(env, sessionId, jobId, chunkBuffers);
    const containerMs = Date.now() - containerStart;
    console.log(
      `[postproc:${jobId}] container: audio=${assembly.audio.byteLength}B ` +
      `waveform=${assembly.waveform?.byteLength ?? 0}B duration=${assembly.durationSec.toFixed(1)}s (${containerMs}ms)`
    );

    // ── Phase 3a: Write assembled audio to R2 ──────────────────────────────
    const writeAudioStart = Date.now();
    const aKey = assembledAudioKey(organizationId, sessionId, peerId);
    await env.RECORDING_BUCKET.put(aKey, assembly.audio, {
      httpMetadata: { contentType: "audio/webm" },
    });
    const writeAudioMs = Date.now() - writeAudioStart;

    // ── Phase 3b: Write waveform.dat to R2 (if container generated it) ─────
    let writeWaveformMs = 0;
    let wKey: string | null = null;
    if (assembly.waveform && assembly.waveform.byteLength > 0) {
      const writeWaveformStart = Date.now();
      wKey = buildWaveformKey(organizationId, sessionId, peerId);
      await env.RECORDING_BUCKET.put(wKey, assembly.waveform, {
        httpMetadata:   { contentType: "application/octet-stream" },
        customMetadata: {
          pps:         assembly.waveformPps,
          durationSec: String(assembly.durationSec),
          bits:        "8",
        },
      });
      writeWaveformMs = Date.now() - writeWaveformStart;
      console.log(`[postproc:${jobId}] waveform written pps=${assembly.waveformPps} (${writeWaveformMs}ms)`);
    } else {
      console.log(`[postproc:${jobId}] waveform skipped (none generated)`);
    }

    // ── Phase 3c: Diarize + write diarization.json + update D1 row ─────────
    const diarizationStart = Date.now();
    const { result, providerMs, writeDiarMs } = await runDiarizationStep({
      env,
      diarizationId,
      audioBytes: assembly.audio,
      args: {
        organizationId, sessionId, peerId,
        diarizationOpts,
      },
      providerInstance: provider,
      chunkCount: chunkKeys.length,
    });
    void diarizationStart;

    // ── Phase 3d: Build + write timeline.json ──────────────────────────────
    let writeTimelineMs = 0;
    let tKey: string | null = null;
    try {
      if (assembly.waveform && assembly.waveform.byteLength >= 20) {
        const writeTimelineStart = Date.now();

        const wfBuf  = assembly.waveform;
        const wfView = new DataView(wfBuf.buffer, wfBuf.byteOffset, wfBuf.byteLength);
        const wfHdr  = parseWaveformHeader(wfView);
        const dataOffset = headerBytesFor(wfHdr.version);

        const amps: number[] = new Array(wfHdr.length);
        if (wfHdr.is8Bit) {
          const pcm = new Int8Array(wfBuf.buffer, wfBuf.byteOffset + dataOffset);
          for (let i = 0; i < wfHdr.length; i++) {
            const mn = pcm[i * 2];
            const mx = pcm[i * 2 + 1];
            amps[i] = Math.max(Math.abs(mn), Math.abs(mx)) / 127;
          }
        } else {
          const pcm = new Int16Array(wfBuf.buffer, wfBuf.byteOffset + dataOffset);
          for (let i = 0; i < wfHdr.length; i++) {
            const mn = pcm[i * 2];
            const mx = pcm[i * 2 + 1];
            amps[i] = Math.max(Math.abs(mn), Math.abs(mx)) / 32767;
          }
        }

        const secondsPerBucket = wfHdr.samplesPerPixel / wfHdr.sampleRate;
        const utterances = groupWordsToUtterances(result.words);

        const timelineData = buildTimelineData({
          utterances,
          speakers:        result.speakers,
          masterAmplitudes: amps,
          secondsPerBucket,
          durationSec:     result.durationSec ?? assembly.durationSec ?? 0,
        });

        tKey = buildTimelineKey(organizationId, sessionId, peerId);
        await env.RECORDING_BUCKET.put(tKey, JSON.stringify(timelineData), {
          httpMetadata: { contentType: "application/json" },
        });

        writeTimelineMs = Date.now() - writeTimelineStart;
        console.log(
          `[postproc:${jobId}] timeline written ` +
          `speakers=${timelineData.speakers.length} ` +
          `clips=${timelineData.speakers.reduce((n, s) => n + s.clips.length, 0)} ` +
          `markers=${timelineData.markers.length} (${writeTimelineMs}ms)`
        );
      } else {
        console.log(`[postproc:${jobId}] timeline skipped (no waveform to derive from)`);
      }
    } catch (timelineErr) {
      console.error(`[postproc:${jobId}] timeline generation failed (non-fatal):`, timelineErr);
      tKey = null;
      writeTimelineMs = 0;
    }

    const dKey = diarizationKey(organizationId, sessionId, peerId);
    const totalMs = Date.now() - startedAt;

    console.log(
      `[postproc:${jobId}] DONE provider=${result.provider} ` +
      `speakers=${result.speakers.length} words=${result.words.length} ` +
      `pod=${resolvedPodId ?? "(none)"} total=${totalMs}ms`
    );

    return {
      ok:             true,
      diarizationId,
      provider:       result.provider,
      audioKey:       aKey,
      diarizationKey: dKey,
      waveformKey:    wKey,
      waveformPps:    wKey ? assembly.waveformPps : null,
      timelineKey:    tKey,
      podId:          resolvedPodId,
      chunkCount:     chunkKeys.length,
      assembledBytes: assembly.audio.byteLength,
      waveformBytes:  assembly.waveform?.byteLength ?? 0,
      speakerCount:   result.speakers.length,
      wordCount:      result.words.length,
      durationSec:    result.durationSec ?? assembly.durationSec ?? null,
      timings: {
        listMs,
        downloadMs,
        containerMs,
        writeAudioMs,
        writeWaveformMs,
        providerMs,
        writeDiarMs,
        writeTimelineMs,
        ensurePodMs,
        totalMs,
      },
    };

  } catch (err: any) {
    // ── Phase 4 (fail path): mark row failed and rethrow ──────────────────
    const errMessage = String(err?.message ?? err);
    try {
      await db.sessionDiarization.update({
        where: { id: diarizationId },
        data: {
          status:      "failed",
          error:       errMessage.slice(0, 2000),
          attempts:    { increment: 1 },
          completedAt: new Date(),
        },
      });
    } catch (dbErr) {
      console.error(`[postproc:${jobId}] failed to record failure in D1:`, dbErr);
    }
    throw err;
  }
}

// ── Sub-steps ───────────────────────────────────────────────────────────────

/**
 * NEW (R1 pods pass) — ensure the QlaveSessionLog row for this session has
 * a pod. Three cases:
 *
 *   (a) Log has a podId already → return it (no-op).
 *   (b) Log exists but podId is null:
 *        - If requestedPodId provided → set it and return.
 *        - Else create a pod-of-1 with random name, set, return.
 *   (c) No log row exists → just create a pod (so it exists) and return.
 *        The log can be linked later when it appears (lazy self-healing in
 *        get/save server actions).
 *
 * CHANGED (R1.5 fix) — calls `createPodService` (pure service) instead of
 * `createPod` (server action). The pipeline runs in a queue consumer, no
 * request context, no `requestInfo.ctx.user` → server action would reject
 * as unauthorized. The service trusts its inputs.
 */
async function ensurePodForSession(args: {
  organizationId: string;
  siteKey:        string;
  sessionId:      string;
  requestedPodId: string | null;
}): Promise<string> {
  const { organizationId, siteKey, sessionId, requestedPodId } = args;

  // Find the log row for this session+siteKey. (sessionId alone isn't unique
  // across siteKeys but in practice we always have both.)
  const log = await db.qlaveSessionLog.findFirst({
    where:  { siteKey, sessionId },
    select: { id: true, podId: true },
  });

  // (a) Already has a pod — done.
  if (log?.podId) {
    return log.podId;
  }

  // (b/c) Need to attach (or create) one.
  let podId = requestedPodId;
  if (!podId) {
    const created = await createPodService({ organizationId });
    if (!created.ok || !created.data) {
      throw new Error(`createPodService failed: ${created.error ?? "unknown"}`);
    }
    podId = created.data.id;
  }

  // (b) Update the log if it exists. (c) No log — pod still exists, and the
  // first read-side action (getSessionDiarization or save-edit) can link it.
  if (log) {
    await db.qlaveSessionLog.update({
      where: { id: log.id },
      data:  { podId },
    });
  }

  return podId;
}

async function insertDiarizationRow(args: {
  organizationId: string;
  siteKey:        string;
  sessionId:      string;
  peerId:         string;
  providerName:   string;
  providerOpts:   DiarizationOpts;
  triggeredBy?:   string;
}): Promise<string> {
  const row = await db.sessionDiarization.create({
    data: {
      organizationId: args.organizationId,
      siteKey:        args.siteKey,
      sessionId:      args.sessionId,
      peerId:         args.peerId,
      status:         "running",
      provider:       args.providerName,
      providerOpts:   JSON.stringify(args.providerOpts),
      triggeredBy:    args.triggeredBy ?? null,
      startedAt:      new Date(),
    },
    select: { id: true },
  });
  return row.id;
}

async function listAudioChunks(
  env: PostProcessingEnv, organizationId: string, sessionId: string, peerId: string,
): Promise<string[]> {
  const prefix = audioChunkPrefix(organizationId, sessionId, peerId);
  const listed = await env.RECORDING_BUCKET.list({ prefix, limit: 5000 });
  const keys = listed.objects
    .map(o => o.key)
    .filter(k => k.endsWith(".webm"))
    .sort();   // lex sort = playback order (worker zero-pads filenames)

  if (keys.length === 0) {
    const err: any = new Error(`No audio chunks found under ${prefix}`);
    err.code = "NO_CHUNKS";
    throw err;
  }
  return keys;
}

async function downloadChunks(env: PostProcessingEnv, keys: string[]): Promise<ArrayBuffer[]> {
  return Promise.all(
    keys.map(async (key) => {
      const obj = await env.RECORDING_BUCKET.get(key);
      if (!obj) throw new Error(`chunk vanished: ${key}`);
      return obj.arrayBuffer();
    })
  );
}

interface ContainerAssemblyResult {
  audio:       Uint8Array;
  waveform:    Uint8Array | null;
  waveformPps: string;
  durationSec: number;
}

async function assembleInContainer(
  env: PostProcessingEnv,
  sessionId: string,
  jobId: string,
  chunkBuffers: ArrayBuffer[],
): Promise<ContainerAssemblyResult> {
  const form = new FormData();
  form.append("jobId", jobId);
  chunkBuffers.forEach((buf, i) => {
    const name = `chunk-${String(i).padStart(6, "0")}.webm`;
    form.append("chunks", new Blob([buf], { type: "audio/webm" }), name);
  });

  const stub = env.DIARIZE_CONTAINER.get(env.DIARIZE_CONTAINER.idFromName(sessionId));
  const res = await stub.fetch("http://container/assemble-multipart", {
    method: "POST",
    body:   form,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`container assemble failed (${res.status}): ${errText.slice(0, 500)}`);
  }

  const audio = new Uint8Array(await res.arrayBuffer());

  const waveformB64   = res.headers.get("X-Waveform-B64")   ?? "";
  const waveformPps   = res.headers.get("X-Waveform-Pps")   ?? "0";
  const waveformBytes = Number(res.headers.get("X-Waveform-Bytes") ?? "0");
  const durationSec   = Number(res.headers.get("X-Duration-Sec") ?? "0");

  let waveform: Uint8Array | null = null;
  if (waveformBytes > 0 && waveformB64.length > 0) {
    try {
      const binary = atob(waveformB64);
      waveform = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) waveform[i] = binary.charCodeAt(i);
    } catch (e) {
      console.warn(`[postproc] failed to decode X-Waveform-B64 (${waveformB64.length} chars):`, e);
      waveform = null;
    }
  }

  return { audio, waveform, waveformPps, durationSec };
}

async function runDiarizationStep(opts: {
  env: PostProcessingEnv;
  diarizationId: string;
  audioBytes: Uint8Array;
  args: {
    organizationId: string;
    sessionId: string;
    peerId: string;
    diarizationOpts: DiarizationOpts;
  };
  providerInstance: ReturnType<typeof getDiarizationProvider>;
  chunkCount: number;
}): Promise<{
  result: DiarizationResult;
  providerMs: number;
  writeDiarMs: number;
}> {
  const { env, diarizationId, audioBytes, args, providerInstance, chunkCount } = opts;
  const { organizationId, sessionId, peerId, diarizationOpts } = args;

  const providerStart = Date.now();
  let result: DiarizationResult;
  try {
    result = await providerInstance.diarize(
      audioBytes.buffer as ArrayBuffer,
      "audio/webm",
      diarizationOpts,
    );
  } catch (err: any) {
    throw new Error(`provider ${providerInstance.name} failed: ${err?.message ?? err}`);
  }
  const providerMs = Date.now() - providerStart;

  const writeStart = Date.now();
  const dKey = diarizationKey(organizationId, sessionId, peerId);
  const enrichedPayload = {
    ...result,
    sessionId,
    peerId,
    chunkCount,
    generatedAt: new Date().toISOString(),
  };
  await env.RECORDING_BUCKET.put(dKey, JSON.stringify(enrichedPayload, null, 2), {
    httpMetadata: { contentType: "application/json" },
  });

  const slimResult = {
    words:       result.words,
    speakers:    result.speakers,
    transcript:  result.transcript,
    durationSec: result.durationSec,
    provider:    result.provider,
  };

  await db.sessionDiarization.update({
    where: { id: diarizationId },
    data: {
      status:       "done",
      result:       JSON.stringify(slimResult),
      r2Key:        dKey,
      wordCount:    result.words.length,
      speakerCount: result.speakers.length,
      durationSec:  result.durationSec ?? null,
      transcript:   result.transcript,
      completedAt:  new Date(),
    },
  });

  const writeDiarMs = Date.now() - writeStart;
  return { result, providerMs, writeDiarMs };
}