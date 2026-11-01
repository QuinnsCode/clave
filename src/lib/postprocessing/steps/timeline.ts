// src/lib/postprocessing/steps/timeline.ts
//
// STEP: timeline
// INPUT:  diarization-{tag}.json (in-memory or R2) + waveform.dat (in-memory or R2)
// OUTPUT: R2 timeline-{tag}.json
//
// Lifted from runPostProcessing.ts Phase 3d.
//
// PURE COMPUTE: no external services. Reads two artifacts, parses the
// waveform header, computes amplitudes, groups words to utterances,
// builds timeline data, writes JSON. Cheap; safe to re-run.
//
// TAG: timeline is per-provider because it depends on diarization output.
// Same tag as the diarize step that produced its input.

import {
    parseWaveformHeader,
    headerBytesFor,
  } from "@/lib/diarization/waveform";
  import { groupWordsToUtterances } from "@/lib/diarization/utterances";
  import { buildTimelineData } from "@/lib/postprocessing/timeline";
  
  import type {
    TimelineOpts,
    Step,
    StepResult,
    StepRunContext,
  } from "../types";
  import type { AssembleArtifacts } from "./assemble";
  import type { DiarizeArtifacts } from "./diarize";
  
  const STEP_NAME = "timeline" as const;
  const DEPENDS_ON = ["diarize", "waveform"] as const;
  
  const timelineKeyTagged = (o: string, s: string, p: string, tag: string) =>
    `${o}/${s}/${p}/timeline-${tag}.json`;
  
  // Tag is injected by the harness onto opts (see buildStepOpts in runPipeline).
  // We extend the TimelineOpts shape locally to typecheck the injected field.
  interface TimelineOptsWithTag extends TimelineOpts {
    tag?: string;
  }
  
  export const timelineStep: Step<TimelineOpts> = {
    name:      STEP_NAME,
    dependsOn: DEPENDS_ON,
  
    defaultOpts(_env, _ids): TimelineOpts {
      return { mode: "auto" };
    },
  
    async run(opts: TimelineOpts, ctx: StepRunContext): Promise<StepResult> {
      const startedAt = Date.now();
      const { env, ids } = ctx;
      const { organizationId, sessionId, peerId } = ids;
      const tag = (opts as TimelineOptsWithTag).tag ?? "nova3";
  
      try {
        // ── 1. Get diarization data ─────────────────────────────────────────
        // Prefer in-memory result from a fresh diarize run. Fall back to R2.
        let diarization: DiarizeArtifacts["result"] | null = null;
  
        const fromDiarize = ctx.inMemoryArtifacts.get("diarize") as DiarizeArtifacts | undefined;
        if (fromDiarize?.result) {
          diarization = fromDiarize.result;
        } else if (ctx.existing.diarization.key) {
          const obj = await env.RECORDING_BUCKET.get(ctx.existing.diarization.key);
          if (!obj) {
            return {
              step:       STEP_NAME,
              status:     "failed",
              reason:     `diarization vanished from R2: ${ctx.existing.diarization.key}`,
              durationMs: Date.now() - startedAt,
            };
          }
          const text = await obj.text();
          diarization = JSON.parse(text);
        } else {
          return {
            step:       STEP_NAME,
            status:     "failed",
            reason:     "no diarization available (diarize didn't run and no existing diarization JSON)",
            durationMs: Date.now() - startedAt,
          };
        }
  
        if (!diarization || !diarization.words || !diarization.speakers) {
          return {
            step:       STEP_NAME,
            status:     "failed",
            reason:     "diarization data malformed (missing words or speakers)",
            durationMs: Date.now() - startedAt,
          };
        }
  
        // ── 2. Get waveform bytes ───────────────────────────────────────────
        // Prefer in-memory (from a fresh assemble run). Fall back to R2.
        let wfBuf: Uint8Array | null = null;
  
        const fromAssemble = ctx.inMemoryArtifacts.get("assemble") as AssembleArtifacts | undefined;
        if (fromAssemble?.waveform && fromAssemble.waveform.byteLength >= 20) {
          wfBuf = fromAssemble.waveform;
        } else if (ctx.existing.waveform.key) {
          const obj = await env.RECORDING_BUCKET.get(ctx.existing.waveform.key);
          if (!obj) {
            return {
              step:       STEP_NAME,
              status:     "failed",
              reason:     `waveform vanished from R2: ${ctx.existing.waveform.key}`,
              durationMs: Date.now() - startedAt,
            };
          }
          wfBuf = new Uint8Array(await obj.arrayBuffer());
        } else {
          return {
            step:       STEP_NAME,
            status:     "failed",
            reason:     "no waveform available",
            durationMs: Date.now() - startedAt,
          };
        }
  
        if (wfBuf.byteLength < 20) {
          return {
            step:       STEP_NAME,
            status:     "failed",
            reason:     `waveform too short (${wfBuf.byteLength} bytes; need ≥ 20 for header)`,
            durationMs: Date.now() - startedAt,
          };
        }
  
        // ── 3. Parse waveform header + amplitudes ───────────────────────────
        // Same logic as runPostProcessing.ts Phase 3d.
        const wfView    = new DataView(wfBuf.buffer, wfBuf.byteOffset, wfBuf.byteLength);
        const wfHdr     = parseWaveformHeader(wfView);
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
  
        // ── 4. Build timeline ───────────────────────────────────────────────
        const utterances = groupWordsToUtterances(diarization.words);
        const durationSec = diarization.durationSec ?? fromAssemble?.durationSec ?? 0;
  
        const timelineData = buildTimelineData({
          utterances,
          speakers:         diarization.speakers,
          masterAmplitudes: amps,
          secondsPerBucket,
          durationSec,
        });
  
        // ── 5. Write timeline JSON to R2 ────────────────────────────────────
        const tKey = timelineKeyTagged(organizationId, sessionId, peerId, tag);
        const payload = JSON.stringify(timelineData);
        await env.RECORDING_BUCKET.put(tKey, payload, {
          httpMetadata: { contentType: "application/json" },
        });
  
        const clipCount = timelineData.speakers.reduce(
          (n: number, s: { clips: unknown[] }) => n + s.clips.length,
          0,
        );
  
        return {
          step:                STEP_NAME,
          status:              "done",
          artifactKey:         tKey,
          artifactBytes:       new Blob([payload]).size,
          artifactGeneratedAt: new Date(),
          extras: {
            speakerCount: timelineData.speakers.length,
            clipCount,
            markerCount:  timelineData.markers.length,
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