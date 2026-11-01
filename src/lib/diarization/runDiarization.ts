// src/lib/diarization/runDiarization.ts
//
// Orchestrates one peer's diarization end-to-end.
//
//   1. INSERT SessionDiarization row (status: "running")
//   2. List audio chunks from R2 for {organizationId, sessionId, peerId}
//   3. Download chunks via R2 binding (no presign — see comment below)
//   4. Call DIARIZE_CONTAINER /assemble-multipart with chunks as form-data
//   5. Receive assembled WebM bytes
//   6. Write assembled audio to R2 at .../audio.webm
//   7. Call DiarizationProvider.diarize() — provider picked via env var
//   8. Write the diarization JSON to R2 at .../diarization.json
//   9. UPDATE SessionDiarization row (status: "done", slim result, counts)
//   On any failure: UPDATE row (status: "failed", error, attempts++)
//
// Server-only. Used by the manual /api/diarization/run endpoint today, and
// will be called from the diarization queue consumer when auto-trigger lands.

import { db } from "@/db";
import { getDiarizationProvider, type DiarizationResult } from "@/lib/diarization";
import type { DiarizationOpts } from "./types";  // NEW: needed for widened args

// ── R2 key helpers — mirror the recording plugin layout ─────────────────────

const audioChunkPrefix     = (o: string, s: string, p: string) => `${o}/${s}/${p}/audio/`;
const assembledAudioKey    = (o: string, s: string, p: string) => `${o}/${s}/${p}/audio.webm`;
const diarizationKey       = (o: string, s: string, p: string) => `${o}/${s}/${p}/diarization.json`;

// ── Inputs / outputs ────────────────────────────────────────────────────────

export interface RunDiarizationArgs {
  // Identity — all required, caller is responsible for sourcing these
  organizationId: string;   // CHANGED from orgId for consistency with schema
  siteKey:        string;   // NEW
  sessionId:      string;
  peerId:         string;

  // Provider opts (back-compat path via vocabulary kept for now)
  diarizationOpts?: DiarizationOpts;
  vocabulary?:      string[];   // legacy — converted to diarizationOpts internally

  // Audit
  triggeredBy?: string;   // userId | "queue:auto" | "manual:curl"
}

export interface RunDiarizationResult {
  ok:             true;
  diarizationId:  string;     // NEW: SessionDiarization row id (so callers can reference it)
  provider:       string;
  chunkCount:     number;
  assembledBytes: number;
  speakerCount:   number;
  wordCount:      number;
  durationSec?:   number;
  assembledKey:   string;
  diarizationKey: string;
  timings: {
    listMs:       number;
    containerMs:  number;
    providerMs:   number;
    totalMs:      number;
  };
}

// Env shape this function needs — narrow to just the bindings it touches
// so callers can pass `env as any` from cloudflare:workers without TS friction.
interface RunDiarizationEnv {
  RECORDING_BUCKET: R2Bucket;
  DIARIZE_CONTAINER: DurableObjectNamespace;
  // For getDiarizationProvider — passes through to factory
  AI?: any;
  TRANSCRIPTION_AI?: any;
  DIARIZATION_PROVIDER?: string;
  XAI_API_KEY?: string;
  DEEPGRAM_API_KEY?: string;
}

// ── Main ────────────────────────────────────────────────────────────────────

export async function runDiarization(
  env:  RunDiarizationEnv,
  args: RunDiarizationArgs,
): Promise<RunDiarizationResult> {
  const { organizationId, siteKey, sessionId, peerId, triggeredBy } = args;
  const jobId = `${sessionId}-${peerId}`;
  const startedAt = Date.now();

  // ── 0. Resolve diarization opts ───────────────────────────────────────────
  // Prefer the new diarizationOpts arg. Fall back to legacy vocabulary-only
  // shortcut so existing callers (e.g. curl path) keep working.
  const diarizationOpts: DiarizationOpts =
    args.diarizationOpts ?? (args.vocabulary ? { vocabulary: args.vocabulary } : {});

  // ── 1. INSERT D1 row (status: running) ────────────────────────────────────
  // We don't go through a "queued" state here because this function is called
  // synchronously — there's no queue stage. (The queue consumer will INSERT
  // as "queued" first, then UPDATE to "running" when it picks up the message.)
  // Resolve provider name eagerly so we can record it on the row before the
  // (expensive) work begins — useful if something crashes mid-run.
  const provider = getDiarizationProvider(env as any);
  const diarizationRow = await db.sessionDiarization.create({
    data: {
      organizationId,
      siteKey,
      sessionId,
      peerId,
      status:       "running",
      provider:     provider.name,
      providerOpts: JSON.stringify(diarizationOpts),
      triggeredBy:  triggeredBy ?? null,
      startedAt:    new Date(),
    },
    select: { id: true },
  });
  const diarizationId = diarizationRow.id;

  try {
    // ── 2. List audio chunks ────────────────────────────────────────────────
    const listStart = Date.now();
    const prefix = audioChunkPrefix(organizationId, sessionId, peerId);
    const listed = await env.RECORDING_BUCKET.list({ prefix, limit: 5000 });
    // Sort lex (zero-padded indices = playback order)
    const chunkKeys = listed.objects
      .map(o => o.key)
      .filter(k => k.endsWith(".webm"))
      .sort();
    const listMs = Date.now() - listStart;

    if (chunkKeys.length === 0) {
      const err: any = new Error(`No audio chunks found under ${prefix}`);
      err.code = "NO_CHUNKS";
      throw err;
    }
    console.log(`[diarize:${jobId}] listed ${chunkKeys.length} chunks (${listMs}ms)`);

    // ── 3. Download chunks via R2 binding ───────────────────────────────────
    // Worker reads chunks → builds multipart → POSTs to container.
    // Avoids needing R2 credentials inside the container. Within Worker's
    // 128MB memory cap for sessions up to ~4 hours of opus.
    const downloadStart = Date.now();
    const chunkBuffers: ArrayBuffer[] = await Promise.all(
      chunkKeys.map(async (key) => {
        const obj = await env.RECORDING_BUCKET.get(key);
        if (!obj) throw new Error(`chunk vanished: ${key}`);
        return obj.arrayBuffer();
      })
    );
    const downloadMs = Date.now() - downloadStart;
    console.log(`[diarize:${jobId}] downloaded ${chunkBuffers.length} chunks (${downloadMs}ms)`);

    // ── 4. Call container /assemble-multipart ───────────────────────────────
    // Build a multipart form with chunk-NNNNNN.webm files in order.
    const form = new FormData();
    form.append("jobId", jobId);
    chunkBuffers.forEach((buf, i) => {
      const name = `chunk-${String(i).padStart(6, "0")}.webm`;
      form.append("chunks", new Blob([buf], { type: "audio/webm" }), name);
    });

    const containerStart = Date.now();
    const stub = env.DIARIZE_CONTAINER.get(env.DIARIZE_CONTAINER.idFromName(sessionId));
    const containerRes = await stub.fetch("http://container/assemble-multipart", {
      method: "POST",
      body:   form,
    });

    if (!containerRes.ok) {
      const errText = await containerRes.text().catch(() => "");
      throw new Error(`container assemble failed (${containerRes.status}): ${errText.slice(0, 500)}`);
    }

    const assembled = new Uint8Array(await containerRes.arrayBuffer());
    const containerMs = Date.now() - containerStart;
    console.log(`[diarize:${jobId}] container returned ${assembled.byteLength} bytes (${containerMs}ms)`);

    // ── 5. Write assembled audio to R2 ──────────────────────────────────────
    const aKey = assembledAudioKey(organizationId, sessionId, peerId);
    await env.RECORDING_BUCKET.put(aKey, assembled, {
      httpMetadata: { contentType: "audio/webm" },
    });

    // ── 6. Call diarization provider ────────────────────────────────────────
    const providerStart = Date.now();
    let result: DiarizationResult;
    try {
      result = await provider.diarize(
        assembled.buffer as ArrayBuffer,
        "audio/webm",
        diarizationOpts,  // CHANGED: pass full opts, not just vocabulary
      );
    } catch (err: any) {
      throw new Error(`provider ${provider.name} failed: ${err?.message ?? err}`);
    }
    const providerMs = Date.now() - providerStart;
    console.log(`[diarize:${jobId}] ${provider.name} returned ${result.speakers.length} speakers, ${result.words.length} words (${providerMs}ms)`);

    // ── 7. Write diarization JSON to R2 (full result with raw) ──────────────
    const dKey = diarizationKey(organizationId, sessionId, peerId);
    const enrichedPayload = {
      ...result,
      sessionId,
      peerId,
      chunkCount:  chunkKeys.length,
      generatedAt: new Date().toISOString(),
    };
    await env.RECORDING_BUCKET.put(dKey, JSON.stringify(enrichedPayload, null, 2), {
      httpMetadata: { contentType: "application/json" },
    });

    // ── 8. UPDATE D1 row with slim result + denormalized fields ─────────────
    // Slim = drop `raw` (the provider's native response). R2 keeps the full
    // archive for forensics; D1 keeps just what the UI needs to render.
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

    const totalMs = Date.now() - startedAt;

    return {
      ok:             true,
      diarizationId,
      provider:       result.provider,
      chunkCount:     chunkKeys.length,
      assembledBytes: assembled.byteLength,
      speakerCount:   result.speakers.length,
      wordCount:      result.words.length,
      durationSec:    result.durationSec,
      assembledKey:   aKey,
      diarizationKey: dKey,
      timings: {
        listMs,
        containerMs,
        providerMs,
        totalMs,
      },
    };
  } catch (err: any) {
    // ── Failure: mark row failed and rethrow ──────────────────────────────
    // attempts: 1 because this is the only attempt the orchestrator makes.
    // Retries are the caller's responsibility (queue consumer will increment).
    const errMessage = String(err?.message ?? err);
    try {
      await db.sessionDiarization.update({
        where: { id: diarizationId },
        data: {
          status:      "failed",
          error:       errMessage.slice(0, 2000),  // cap to avoid runaway rows
          attempts:    { increment: 1 },
          completedAt: new Date(),
        },
      });
    } catch (dbErr) {
      // If we can't even write the failure, log and let original error escape.
      // Don't shadow the real error with a DB write error.
      console.error(`[diarize:${jobId}] failed to record failure in D1:`, dbErr);
    }
    throw err;
  }
}