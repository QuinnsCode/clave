// src/lib/postprocessing/steps/diarize.ts
//
// STEP: diarize
// INPUT:  R2 audio.webm (or in-memory from a fresh assemble run)
// OUTPUT: R2 diarization-{tag}.json
//
// Lifted from runPostProcessing.ts Phase 3c (runDiarizationStep).
//
// TAG IN R2 PATH: this step writes to `diarization-{tag}.json` so multiple
// providers can produce parallel artifacts for the same (session, peer)
// without overwriting each other. The harness injects the tag into opts
// before calling run().
//
// MULTI-RUN: legacy code wrote to `diarization.json` (untagged). New code
// writes tagged. Read-side (getSessionDiarization etc) reads the tagged
// path. Backfill copied the legacy r2_key into diarization_key so existing
// rows keep working.

import { getDiarizationProvider, type DiarizationResult } from "@/lib/diarization";

import type {
  DiarizeOpts,
  Step,
  StepResult,
  StepRunContext,
} from "../types";
import type { AssembleArtifacts } from "./assemble";

const STEP_NAME = "diarize" as const;
const DEPENDS_ON = ["assemble"] as const;

const diarizationKeyTagged = (o: string, s: string, p: string, tag: string) =>
  `${o}/${s}/${p}/diarization-${tag}.json`;

function defaultTagFor(provider: string): string {
  return provider.replace(/^workers-ai-/, "").toLowerCase();
}

// In-memory diarization result that timeline reads.
export interface DiarizeArtifacts {
  result: DiarizationResult;
  tag:    string;
}

export const diarizeStep: Step<DiarizeOpts> = {
  name:      STEP_NAME,
  dependsOn: DEPENDS_ON,

  defaultOpts(env: any, _ids): DiarizeOpts {
    const provider = env.DIARIZATION_PROVIDER ?? "workers-ai-nova3";
    return {
      mode:     "auto",
      provider,
      tag:      defaultTagFor(provider),
      opts:     {},
    };
  },

  async run(opts: DiarizeOpts, ctx: StepRunContext): Promise<StepResult> {
    const startedAt = Date.now();
    const { env, ids } = ctx;
    const { organizationId, sessionId, peerId } = ids;

    const tag = opts.tag ?? "nova3";

    try {
      // ── 1. Get audio bytes ──────────────────────────────────────────────
      // Prefer in-memory (assemble just ran). Fall back to R2 read.
      let audioBytes: Uint8Array;

      const fromAssemble = ctx.inMemoryArtifacts.get("assemble") as AssembleArtifacts | undefined;
      if (fromAssemble?.audio) {
        audioBytes = fromAssemble.audio;
      } else if (ctx.existing.audio.key) {
        const obj = await env.RECORDING_BUCKET.get(ctx.existing.audio.key);
        if (!obj) {
          return {
            step:       STEP_NAME,
            status:     "failed",
            reason:     `audio.webm vanished from R2: ${ctx.existing.audio.key}`,
            durationMs: Date.now() - startedAt,
          };
        }
        audioBytes = new Uint8Array(await obj.arrayBuffer());
      } else {
        return {
          step:       STEP_NAME,
          status:     "failed",
          reason:     "no audio available (assemble didn't run and no existing audio.webm)",
          durationMs: Date.now() - startedAt,
        };
      }

      // ── 2. Resolve provider ────────────────────────────────────────────
      // Respect opts.provider if caller specified one; otherwise factory
      // uses env.DIARIZATION_PROVIDER.
      const providerEnv = opts.provider
        ? { ...env, DIARIZATION_PROVIDER: opts.provider }
        : env;
      const provider = getDiarizationProvider(providerEnv as any);

      // ── 3. Call provider.diarize() ─────────────────────────────────────
      let result: DiarizationResult;
      try {
        result = await provider.diarize(
          audioBytes.buffer as ArrayBuffer,
          "audio/webm",
          opts.opts ?? {},
        );
      } catch (err: any) {
        return {
          step:       STEP_NAME,
          status:     "failed",
          reason:     `provider ${provider.name} failed: ${err?.message ?? err}`,
          durationMs: Date.now() - startedAt,
        };
      }

      // ── 4. Write full diarization JSON to R2 ───────────────────────────
      const dKey = diarizationKeyTagged(organizationId, sessionId, peerId, tag);
      const enrichedPayload = {
        ...result,
        sessionId,
        peerId,
        tag,
        generatedAt: new Date().toISOString(),
      };
      const payloadStr = JSON.stringify(enrichedPayload, null, 2);
      await env.RECORDING_BUCKET.put(dKey, payloadStr, {
        httpMetadata: { contentType: "application/json" },
      });

      // ── 5. Stash for downstream timeline step ──────────────────────────
      const inMem: DiarizeArtifacts = { result, tag };
      ctx.inMemoryArtifacts.set(STEP_NAME, inMem);

      // ── 6. Build slim result for D1 row ────────────────────────────────
      const slimResult = {
        words:       result.words,
        speakers:    result.speakers,
        transcript:  result.transcript,
        durationSec: result.durationSec,
        provider:    result.provider,
      };

      return {
        step:                STEP_NAME,
        status:              "done",
        artifactKey:         dKey,
        artifactBytes:       new Blob([payloadStr]).size,
        artifactGeneratedAt: new Date(),
        extras: {
          wordCount:    result.words.length,
          speakerCount: result.speakers.length,
          durationSec:  result.durationSec,
          transcript:   result.transcript,
          provider:     result.provider,
          result:       JSON.stringify(slimResult),
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