// src/app/api/qlave/getInitialTranscript.ts
// Fetches persisted transcript chunks for a session from D1.
// Returns empty array if none exist — never throws.

import { db } from "@/db";

export type TranscriptChunk = {
  peerId:    string;
  text:      string;
  timestamp: number;
};

export async function getInitialTranscript(sessionId: string): Promise<TranscriptChunk[]> {
  try {
    const row = await db.sessionTranscript.findFirst({ where: { sessionId } });
    if (!row) return [];
    return JSON.parse(row.chunks) as TranscriptChunk[];
  } catch {
    return [];
  }
}