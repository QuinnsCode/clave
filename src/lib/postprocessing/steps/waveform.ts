// src/lib/postprocessing/steps/waveform.ts
//
// STEP: waveform
// INPUT:  R2 audio.webm (OR in-memory from a fresh assemble run)
// OUTPUT: R2 waveform.dat
//
// COUPLING WITH ASSEMBLE:
//   In the normal pipeline flow, assemble already produces a waveform as
//   a side-effect of its single ffmpeg pass. This step, when run in "auto"
//   mode after assemble, sees ctx.existing.waveform.exists === true and the
//   harness auto-skips it.
//
//   This step actually runs only when:
//     - assemble is skipped AND no waveform exists yet ("regen-waveform"
//       combo, or first-run for an audio-only session)
//     - mode is "force"
//
// CONTAINER ENDPOINT:
//   /waveform-only (v0.6.4+) takes pre-assembled audio.webm as the request
//   body (raw bytes, not multipart) and returns the same X-Waveform-* headers
//   as /assemble-multipart's waveform side-effect. Empty body in response —
//   all data is in headers.

import { waveformKey as buildWaveformKey } from "@/lib/diarization/waveform";

import type {
  WaveformOpts,
  Step,
  StepResult,
  StepRunContext,
} from "../types";
import type { AssembleArtifacts } from "./assemble";

const STEP_NAME = "waveform" as const;
const DEPENDS_ON = ["assemble"] as const;

export const waveformStep: Step<WaveformOpts> = {
  name:      STEP_NAME,
  dependsOn: DEPENDS_ON,

  defaultOpts(_env, _ids): WaveformOpts {
    return { mode: "auto", pixelsPerSecond: "1" };
  },

  async run(_opts: WaveformOpts, ctx: StepRunContext): Promise<StepResult> {
    const startedAt = Date.now();
    const { env, ids } = ctx;
    const { organizationId, sessionId, peerId } = ids;

    try {
      // ── Case A: assemble just ran, waveform is in memory ────────────────
      // Most common path. The waveform was produced as a side-effect of
      // assemble's container call. Assemble already wrote it to R2 — we
      // surface it as this step's artifact so the D1 row tracks both
      // audio_* and waveform_* fields via patchStepResult.
      const fromAssemble = ctx.inMemoryArtifacts.get("assemble") as AssembleArtifacts | undefined;
      if (fromAssemble?.waveform && fromAssemble.waveform.byteLength > 0) {
        const wKey = buildWaveformKey(organizationId, sessionId, peerId);

        return {
          step:                STEP_NAME,
          status:              "done",
          artifactKey:         wKey,
          artifactBytes:       fromAssemble.waveform.byteLength,
          artifactGeneratedAt: new Date(),
          extras: {
            pps:         fromAssemble.waveformPps,
            durationSec: fromAssemble.durationSec,
          },
          durationMs: Date.now() - startedAt,
        };
      }

      // ── Case B: standalone regen via /waveform-only container endpoint ──
      // Get audio.webm bytes (existing R2 file — assemble didn't run this call).
      if (!ctx.existing.audio.key) {
        return {
          step:       STEP_NAME,
          status:     "failed",
          reason:     "no audio available (assemble didn't run and no existing audio.webm in R2)",
          durationMs: Date.now() - startedAt,
        };
      }

      const audioObj = await env.RECORDING_BUCKET.get(ctx.existing.audio.key);
      if (!audioObj) {
        return {
          step:       STEP_NAME,
          status:     "failed",
          reason:     `audio.webm vanished from R2: ${ctx.existing.audio.key}`,
          durationMs: Date.now() - startedAt,
        };
      }
      const audioBytes = await audioObj.arrayBuffer();

      // POST raw bytes to /waveform-only on the diarize container.
      // jobId is just for log correlation on the container side; we use the
      // session+peer pair for parity with /assemble-multipart's jobId convention.
      const jobId = `wfonly-${sessionId}-${peerId}`;
      const stub  = env.DIARIZE_CONTAINER.get(env.DIARIZE_CONTAINER.idFromName(sessionId));
      const res   = await stub.fetch("http://container/waveform-only", {
        method: "POST",
        headers: {
          "Content-Type": "audio/webm",
          "X-Job-Id":     jobId,
        },
        body: audioBytes,
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        return {
          step:       STEP_NAME,
          status:     "failed",
          reason:     `container /waveform-only failed (${res.status}): ${errText.slice(0, 500)}`,
          durationMs: Date.now() - startedAt,
        };
      }

      // Drain the empty body so the connection releases cleanly. The data
      // is in headers, but we still need to consume the response.
      await res.arrayBuffer();

      const waveformB64   = res.headers.get("X-Waveform-B64")   ?? "";
      const waveformPps   = res.headers.get("X-Waveform-Pps")   ?? "1";
      const waveformBytes = Number(res.headers.get("X-Waveform-Bytes") ?? "0");
      const durationSec   = Number(res.headers.get("X-Duration-Sec") ?? "0");

      if (waveformBytes === 0 || waveformB64.length === 0) {
        return {
          step:       STEP_NAME,
          status:     "failed",
          reason:     "container /waveform-only returned empty waveform (decode or audiowaveform failed)",
          durationMs: Date.now() - startedAt,
        };
      }

      // Decode base64 → bytes.
      let waveform: Uint8Array;
      try {
        const binary = atob(waveformB64);
        waveform = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) waveform[i] = binary.charCodeAt(i);
      } catch (e: any) {
        return {
          step:       STEP_NAME,
          status:     "failed",
          reason:     `failed to decode X-Waveform-B64 (${waveformB64.length} chars): ${e?.message ?? e}`,
          durationMs: Date.now() - startedAt,
        };
      }

      // Write to R2 with customMetadata matching what assemble step writes.
      const wKey = buildWaveformKey(organizationId, sessionId, peerId);
      await env.RECORDING_BUCKET.put(wKey, waveform, {
        httpMetadata:   { contentType: "application/octet-stream" },
        customMetadata: {
          pps:         waveformPps,
          durationSec: String(durationSec),
          bits:        "8",
        },
      });

      // Stash in memory so timeline step can read without R2 round-trip.
      // Build a synthetic AssembleArtifacts so the timeline step's
      // "fromAssemble.waveform" path works.
      const existing = ctx.inMemoryArtifacts.get("assemble") as AssembleArtifacts | undefined;
      ctx.inMemoryArtifacts.set("assemble", {
        audio:       existing?.audio ?? new Uint8Array(0),
        waveform,
        waveformPps,
        durationSec: existing?.durationSec ?? durationSec,
      });

      return {
        step:                STEP_NAME,
        status:              "done",
        artifactKey:         wKey,
        artifactBytes:       waveform.byteLength,
        artifactGeneratedAt: new Date(),
        extras: {
          pps:         waveformPps,
          durationSec,
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