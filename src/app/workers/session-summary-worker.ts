// src/app/workers/session-summary-worker.ts
// Handles "summarize-session" queue messages.
// Reads transcript from D1, runs Workers AI summarization, writes back to D1.

import { setupDb, db } from "@/db";

export interface SummarizeSessionMessage {
  type: "summarize-session";
  sessionId: string;
  siteKey: string;
}

export async function handleSummarizeSession(
  message: SummarizeSessionMessage,
  env: Env
): Promise<void> {
  const { sessionId, siteKey } = message;

  await setupDb(env as any);

  // Fetch transcript
  const transcript = await db.sessionTranscript.findFirst({
    where: { sessionId },
  });

  if (!transcript || !transcript.chunks) {
    console.log(`[SummaryWorker] No transcript found for session ${sessionId}`);
    return;
  }

  let chunks: { peerId: string; displayName: string; text: string; timestamp: number }[];
  try {
    chunks = JSON.parse(transcript.chunks);
  } catch {
    console.error(`[SummaryWorker] Failed to parse transcript chunks for ${sessionId}`);
    return;
  }

  if (chunks.length === 0) return;

  // Format transcript as readable script
  const script = chunks
    .map(c => `[${new Date(c.timestamp).toISOString()}] ${c.displayName ?? c.peerId}: ${c.text}`)
    .join("\n");

  // Run AI summarization via Workers AI
  try {
    const ai = (env as any).AI;
    const response = await ai.run("@cf/meta/llama-3.1-8b-instruct", {
      messages: [
        {
          role: "system",
          content: `You are summarizing a collaborative session transcript. 
Extract and return a JSON object with these fields:
- "tldr": 2-3 sentence summary of what happened
- "keyMoments": array of up to 5 important moments or decisions (strings)
- "actionItems": array of tasks or follow-ups mentioned (strings)  
- "speakerSummary": object mapping each speaker name to 1 sentence about their contributions
- "topics": array of main topics discussed (strings)
Return only valid JSON, no markdown.`,
        },
        {
          role: "user",
          content: `Summarize this session transcript:\n\n${script.slice(0, 8000)}`, // ~8k char limit
        },
      ],
    });

    let summary: object;
    try {
      const text = response?.response ?? response?.result?.response ?? "";
      summary = JSON.parse(text);
    } catch {
      // AI returned non-JSON — store raw text
      summary = { tldr: response?.response ?? "Summary unavailable", raw: true };
    }

    // Upsert summary row
    const existing = await db.sessionSummary.findFirst({ where: { sessionId } });
    if (existing) {
      await db.sessionSummary.update({
        where: { id: existing.id },
        data: { summary: JSON.stringify(summary), updatedAt: new Date() },
      });
    } else {
      await db.sessionSummary.create({
        data: {
          id:        crypto.randomUUID(),
          sessionId,
          siteKey,
          summary:   JSON.stringify(summary),
        },
      });
    }

    console.log(`[SummaryWorker] Summary written for session ${sessionId}`);
  } catch (e) {
    console.error(`[SummaryWorker] AI summarization failed for ${sessionId}:`, e);
  }
}