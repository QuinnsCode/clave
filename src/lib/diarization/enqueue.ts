// src/lib/diarization/enqueue.ts
//
// Pure producer for diarization fan-out. Sends one diarize-peer message per
// peer to DIARIZE_QUEUE. No DO/KV/D1 access — caller sources peerIds and any
// provider opts. Dependency injection by design: swap the queue for a DO or
// cron later by changing only this file.
//
// Consumed by src/lib/diarization/queueConsumer.ts.
//
// Server-only.

import type { DiarizationOpts } from "./types";

// ── Message shape ────────────────────────────────────────────────────────────
// Keep this in sync with the DiarizeQueueMessage shape in queueConsumer.ts.
// (We deliberately don't share a type to avoid one file silently breaking the
// other when fields are added — the queue is the contract.)

export interface DiarizePeerMessage {
  type:             "diarize-peer";
  organizationId:   string;
  siteKey:          string;
  sessionId:        string;
  peerId:           string;
  diarizationOpts?: DiarizationOpts;
}

// ── Inputs ───────────────────────────────────────────────────────────────────

export interface EnqueueDiarizationArgs {
  organizationId: string;
  siteKey:        string;
  sessionId:      string;

  /** Peer IDs whose audio should be diarized. Caller filters by audioChunkCount etc. */
  peerIds: string[];

  /**
   * Optional per-session provider config. Forwarded to each message and
   * eventually to runDiarization. Today this is unused (defaults applied);
   * once per-room config UI lands, callers will read from OrgPlugin and pass.
   */
  diarizationOpts?: DiarizationOpts;
}

// Narrow env shape — only the binding this function touches
export interface EnqueueDiarizationEnv {
  DIARIZE_QUEUE: Queue<DiarizePeerMessage>;
}

// ── Main ─────────────────────────────────────────────────────────────────────

/**
 * Enqueue one diarize-peer message per peer.
 *
 * Returns counts so the caller can log fan-out outcome. Individual send
 * failures are caught and counted, NOT thrown — partial fan-out is better than
 * no fan-out. If you need all-or-nothing semantics, check `failed === 0`
 * yourself.
 *
 * If `peerIds` is empty, this is a no-op (zero enqueued, zero failed).
 */
export async function enqueueDiarization(
  env:  EnqueueDiarizationEnv,
  args: EnqueueDiarizationArgs,
): Promise<{ enqueued: number; failed: number }> {
  let enqueued = 0;
  let failed   = 0;

  for (const peerId of args.peerIds) {
    try {
      await env.DIARIZE_QUEUE.send({
        type:            "diarize-peer",
        organizationId:  args.organizationId,
        siteKey:         args.siteKey,
        sessionId:       args.sessionId,
        peerId,
        diarizationOpts: args.diarizationOpts,
      });
      enqueued++;
    } catch (e) {
      failed++;
      console.error(`[enqueueDiarization] send failed for peer ${peerId} in session ${args.sessionId}:`, e);
    }
  }

  return { enqueued, failed };
}