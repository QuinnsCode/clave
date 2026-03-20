// app/workers/transcription-usage-worker.ts
// Queue consumer — writes TranscriptionUsage rows to D1.
// Runs as a separate Worker binding, never on the hot path.

import { setupDb, db } from "@/db";
import { env } from "cloudflare:workers";

export interface UsageMessage {
  orgId:        string;
  userId:       string;
  sessionId:    string | null;
  siteKey:      string;
  model:        string;
  audioSeconds: number;
  neuronsUsed:  number;
  costUsd:      number;
  mode:         string;
  recordedAt:   string;
}

export default {
  async queue(batch: MessageBatch<UsageMessage>): Promise<void> {
    await setupDb(env);

    // Batch insert — all messages in one transaction
    const rows = batch.messages.map(m => m.body);

    try {
      await db.transcriptionUsage.createMany({
        data: rows.map(r => ({
          organizationId: r.orgId,
          userId:         r.userId,
          sessionId:      r.sessionId,
          siteKey:        r.siteKey,
          model:          r.model,
          audioSeconds:   r.audioSeconds,
          neuronsUsed:    r.neuronsUsed,
          costUsd:        r.costUsd,
          mode:           r.mode,
          recordedAt:     new Date(r.recordedAt),
        })),
      });
      batch.ackAll();
    } catch (e) {
      console.error("TranscriptionUsage batch insert failed:", e);
      batch.retryAll();
    }
  },
};