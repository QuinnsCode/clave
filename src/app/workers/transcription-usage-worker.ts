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

/** Insert usage rows. Throws on failure; the caller acks or retries its own messages. */
export async function writeUsageRows(rows: UsageMessage[]): Promise<void> {
  if (rows.length === 0) return;
  await setupDb(env);
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
}
