// src/app/api/diarization/run-v2.ts
//
// POST /api/diarization/run-v2
// PARALLEL TEST ENDPOINT for the new harness (runPipeline).
//
// Same identity + opts shape as /api/diarization/run, but routes through the
// combo-based harness instead of the legacy runPostProcessing.
//
// Use this to verify the harness produces equivalent artifacts BEFORE
// swapping /run to call runPipeline. Once verified, this file can be
// deleted and /run.ts updated to point at runPipeline.
//
// Body:
//   {
//     organizationId: string,
//     siteKey:        string,
//     sessionId:      string,
//     peerId:         string,
//
//     // Optional harness controls — sane defaults if omitted:
//     combo?:         "none" | "minimal" | "transcribed" | "diarized" | "animal-style",
//     steps?:         StepsConfig (per-step overrides),
//
//     // Legacy shortcuts — converted to harness opts:
//     diarizationOpts?: DiarizationOpts,
//     vocabulary?:      string[],
//   }
//
// Returns the PipelineResult shape: combo, per-step results, total time,
// diarizationId, plus the IDs that were processed.

import { env } from "cloudflare:workers";
import { runPipeline } from "@/lib/postprocessing/runPipeline";
import type { PipelineArgs, Combo, StepsConfig } from "@/lib/postprocessing/types";
import type { DiarizationOpts } from "@/lib/diarization/types";

export default async function handler({
  request,
}: { request: Request; ctx: any }): Promise<Response> {
  if (request.method !== "POST") {
    return Response.json({ ok: false, error: "Method not allowed" }, { status: 405 });
  }

  // Auth deferred — same posture as /run.ts today. Tier gating happens in
  // the server action wrapper (next step), not here.

  // ── Parse body ──────────────────────────────────────────────────────────
  let body: any;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  // Accept either organizationId or legacy orgId.
  const organizationId: unknown = body?.organizationId ?? body?.orgId;
  const { siteKey, sessionId, peerId, combo, steps, vocabulary, diarizationOpts } = body ?? {};

  if (typeof organizationId !== "string" || !organizationId) {
    return Response.json({ ok: false, error: "missing organizationId" }, { status: 400 });
  }
  if (typeof siteKey !== "string" || !siteKey) {
    return Response.json({ ok: false, error: "missing siteKey" }, { status: 400 });
  }
  if (typeof sessionId !== "string" || !sessionId) {
    return Response.json({ ok: false, error: "missing sessionId" }, { status: 400 });
  }
  if (typeof peerId !== "string" || !peerId) {
    return Response.json({ ok: false, error: "missing peerId" }, { status: 400 });
  }

  // ── Build harness args ──────────────────────────────────────────────────
  // Legacy `vocabulary` / `diarizationOpts` get folded into the diarize step's
  // opts. Caller can also pass `steps.diarize.opts` directly which wins on collision.
  const legacyDiarOpts: DiarizationOpts | undefined =
    (diarizationOpts && typeof diarizationOpts === "object")
      ? diarizationOpts as DiarizationOpts
      : (Array.isArray(vocabulary) ? { vocabulary } : undefined);

  const stepsConfig: StepsConfig = {
    ...(steps ?? {}),
  };
  if (legacyDiarOpts) {
    stepsConfig.diarize = {
      ...(stepsConfig.diarize ?? {}),
      opts: { ...legacyDiarOpts, ...(stepsConfig.diarize?.opts ?? {}) },
    };
  }

  const pipelineArgs: PipelineArgs = {
    ids: { organizationId, siteKey, sessionId, peerId },
    combo: (combo as Combo) ?? "diarized",  // default matches legacy behavior
    steps: stepsConfig,
    triggeredBy: "manual:curl-v2",
  };

  // ── Run pipeline ────────────────────────────────────────────────────────
  try {
    const result = await runPipeline(env as any, pipelineArgs);
    return Response.json(result);
  } catch (err: any) {
    return Response.json({
      ok:    false,
      error: String(err?.message ?? err),
      code:  err?.code,
    }, { status: 500 });
  }
}