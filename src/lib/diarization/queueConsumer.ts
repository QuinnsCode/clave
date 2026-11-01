// src/lib/diarization/queueConsumer.ts
//
// Queue consumer for post-session diarization jobs.
//
// CURRENT STATE (transitional):
//   Tries the new harness (runPipeline + combo) first. If it throws, falls
//   back to the legacy runPostProcessing path so the session at least gets
//   processed. Both paths are non-destructive — runPipeline creates D1 rows
//   under tag "nova3"; runPostProcessing creates rows without explicit tag
//   (defaults via schema). Worst case is dupe rows, which we can clean up.
//
// REMOVAL PLAN:
//   Once the new harness has run cleanly in prod for ~a week with no fallback
//   triggers logged, delete the fallback + the runPostProcessing import +
//   the file itself (runPostProcessing.ts). Search for "REMOVE-WHEN-STABLE"
//   to find the lines to nuke.

import { setupDb } from "@/db";
import { runPipeline } from "@/lib/postprocessing/runPipeline";
import { runPostProcessing } from "@/lib/postprocessing/runPostProcessing";   // REMOVE-WHEN-STABLE
import type { DiarizationOpts } from "./types";

export interface DiarizeQueueMessage {
  type:            "diarize-peer";
  organizationId:  string;
  siteKey:         string;
  sessionId:       string;
  peerId:          string;
  diarizationOpts?: DiarizationOpts;
}

export async function handleDiarizeQueue(
  batch: MessageBatch<DiarizeQueueMessage>,
  env: Env,
): Promise<void> {
  // Must initialize db before any pipeline code touches it.
  // Queue context doesn't go through the normal request middleware that
  // calls setupDb — so we do it here explicitly, same as other queue handlers.
  await setupDb(env as any);

  for (const msg of batch.messages) {
    const body = msg.body;
    if (body.type !== "diarize-peer") {
      msg.ack();
      continue;
    }

    const ids = {
      organizationId: body.organizationId,
      siteKey:        body.siteKey,
      sessionId:      body.sessionId,
      peerId:         body.peerId,
    };

    // ── Primary: new harness ───────────────────────────────────────────────
    // animal-style runs assemble + waveform + diarize + cleanup + timeline.
    // Cleanup will skip on sessions whose pod has no anchors — that's
    // expected, not an error.
    try {
      await runPipeline(env as any, {
        ids,
        combo:       "animal-style",
        triggeredBy: "queue:auto",
        steps: body.diarizationOpts
          ? { diarize: { opts: body.diarizationOpts } }
          : undefined,
      });
      msg.ack();
      continue;
    } catch (newErr: any) {
      // Log loudly so we can see when the fallback kicks in. Don't ack yet —
      // we'll try the legacy path before giving up.
      console.error(
        `[diarize-queue] runPipeline FAILED for ${body.sessionId}/${body.peerId} ` +
        `— falling back to legacy runPostProcessing. error:`,
        newErr,
      );
    }

    // ── Fallback: legacy path ──────────────────────────────────────────────
    // REMOVE-WHEN-STABLE: delete this block + the import once runPipeline has
    // proven itself in prod. The session will still be processed; just no
    // cleanup step (legacy path doesn't know about it).
    try {
      await runPostProcessing(env as any, {
        organizationId:  body.organizationId,
        siteKey:         body.siteKey,
        sessionId:       body.sessionId,
        peerId:          body.peerId,
        diarizationOpts: body.diarizationOpts,
        triggeredBy:     "queue:auto-fallback",
      });
      console.warn(
        `[diarize-queue] legacy fallback SUCCEEDED for ${body.sessionId}/${body.peerId}`,
      );
      msg.ack();
    } catch (legacyErr: any) {
      console.error(
        `[diarize-queue] BOTH paths failed for ${body.sessionId}/${body.peerId}. ` +
        `legacy error:`,
        legacyErr,
      );
      msg.retry();
    }
  }
}