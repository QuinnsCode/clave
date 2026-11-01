// src/lib/postprocessing/steps/assemble.ts
//
// STEP: assemble
// INPUT:  R2 audio chunks ({org}/{session}/{peer}/audio/*.webm)
// OUTPUT: R2 audio.webm (ffmpeg-cleaned, libopus) + waveform.dat (side effect)
//
// Lifted from runPostProcessing.ts Phases 1, 2, 3a, 3b.
//
// SIDE EFFECT: the container's /assemble-multipart endpoint produces BOTH
// the cleaned audio and a waveform.dat in one ffmpeg pass. Splitting them
// would mean decoding the audio twice. So this step writes two artifacts:
//   - result.artifactKey  = the audio.webm key (primary)
//   - result.extras.waveformKey/Bytes/Pps = the waveform side-effect
//
// The waveform step downstream sees ctx.existing.waveform.exists = true
// (via the harness updating runningExisting) and auto-skips.

import { waveformKey as buildWaveformKey } from "@/lib/diarization/waveform";

import type {
  AssembleOpts,
  PipelineIds,
  Step,
  StepResult,
  StepRunContext,
} from "../types";

const STEP_NAME = "assemble" as const;
const DEPENDS_ON = [] as const;

// ── R2 key helpers ─────────────────────────────────────────────────────────
const audioChunkPrefix = (o: string, s: string, p: string) => `${o}/${s}/${p}/audio/`;
const audioKey         = (o: string, s: string, p: string) => `${o}/${s}/${p}/audio.webm`;

// ── In-memory artifact shape that downstream steps read ────────────────────
// Stashed on ctx.inMemoryArtifacts under the "assemble" key.
export interface AssembleArtifacts {
  audio:        Uint8Array;
  waveform:     Uint8Array | null;
  waveformPps:  string;
  durationSec:  number;
}

export const assembleStep: Step<AssembleOpts> = {
  name:      STEP_NAME,
  dependsOn: DEPENDS_ON,

  defaultOpts(_env, _ids): AssembleOpts {
    return { mode: "auto" };
  },

  async run(_opts: AssembleOpts, ctx: StepRunContext): Promise<StepResult> {
    const startedAt = Date.now();
    const { env, ids } = ctx;
    const { organizationId, sessionId, peerId } = ids;

    try {
      // ── 1. List chunks ──────────────────────────────────────────────────
      const prefix = audioChunkPrefix(organizationId, sessionId, peerId);
      const listed = await env.RECORDING_BUCKET.list({ prefix, limit: 5000 });
      const chunkKeys = listed.objects
        .map((o: { key: string }) => o.key)
        .filter((k: string) => k.endsWith(".webm"))
        .sort();

      if (chunkKeys.length === 0) {
        return {
          step:       STEP_NAME,
          status:     "failed",
          reason:     `No audio chunks under ${prefix}`,
          durationMs: Date.now() - startedAt,
        };
      }

      // ── 2. Download chunks ──────────────────────────────────────────────
      const chunkBuffers: ArrayBuffer[] = await Promise.all(
        chunkKeys.map(async (key: string) => {
          const obj = await env.RECORDING_BUCKET.get(key);
          if (!obj) throw new Error(`chunk vanished: ${key}`);
          return obj.arrayBuffer();
        })
      );

      // ── 3. Container assembly ───────────────────────────────────────────
      const jobId = `${sessionId}-${peerId}`;
      const form = new FormData();
      form.append("jobId", jobId);
      chunkBuffers.forEach((buf, i) => {
        const name = `chunk-${String(i).padStart(6, "0")}.webm`;
        form.append("chunks", new Blob([buf], { type: "audio/webm" }), name);
      });

      const stub = env.DIARIZE_CONTAINER.get(env.DIARIZE_CONTAINER.idFromName(sessionId));
      const res  = await stub.fetch("http://container/assemble-multipart", {
        method: "POST",
        body:   form,
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        return {
          step:       STEP_NAME,
          status:     "failed",
          reason:     `container assemble failed (${res.status}): ${errText.slice(0, 500)}`,
          durationMs: Date.now() - startedAt,
        };
      }

      // ── 4. Decode response ──────────────────────────────────────────────
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
        } catch (e: any) {
          console.warn(`[assemble] failed to decode X-Waveform-B64: ${e?.message ?? e}`);
          waveform = null;
        }
      }

      // ── 5. Write assembled audio to R2 ──────────────────────────────────
      const aKey = audioKey(organizationId, sessionId, peerId);
      await env.RECORDING_BUCKET.put(aKey, audio, {
        httpMetadata: { contentType: "audio/webm" },
      });

      // ── 6. Write waveform side-effect to R2 (if container produced one) ─
      let wKey: string | null = null;
      let wBytes: number | null = null;
      if (waveform && waveform.byteLength > 0) {
        wKey = buildWaveformKey(organizationId, sessionId, peerId);
        await env.RECORDING_BUCKET.put(wKey, waveform, {
          httpMetadata:   { contentType: "application/octet-stream" },
          customMetadata: {
            pps:         waveformPps,
            durationSec: String(durationSec),
            bits:        "8",
          },
        });
        wBytes = waveform.byteLength;
      }

      // ── 7. Stash for downstream steps ──────────────────────────────────
      // Diarize reads audio. Timeline reads waveform.
      const inMem: AssembleArtifacts = { audio, waveform, waveformPps, durationSec };
      ctx.inMemoryArtifacts.set(STEP_NAME, inMem);

      return {
        step:                STEP_NAME,
        status:              "done",
        artifactKey:         aKey,
        artifactBytes:       audio.byteLength,
        artifactGeneratedAt: new Date(),
        extras: {
          durationSec,
          // Surface waveform side-effect for harness to record on the row.
          waveformKey:   wKey,
          waveformBytes: wBytes,
          waveformPps:   wKey ? waveformPps : null,
        },
        durationMs: Date.now() - startedAt,
      };
    } catch (err: any) {
      return {
        step:       STEP_NAME,
        status:     "failed",
        reason:     String(err?.message ?? err),
        durationMs: Date.now() - startedAt,
      };
    }
  },
};