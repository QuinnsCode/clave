"use server";
// src/app/serverActions/diarization/getSessionTimeline.ts
//
// Server action that fetches the timeline.json artifact for one peer of one
// session. Returns the parsed structure ready for the UI to render — per-
// speaker tracks with clips, plus markers.
//
// Signature mirrors getSessionWaveform / getSessionRecording for consistency:
//   (sessionId, userId, orgId, peerId) → SessionTimelineView | null
//
// R2 path prefix:
//   Uses orgId if set (new rooms, org-scoped). Falls back to userId for rooms
//   created before orgId was stored. Hard returns null if neither exists.
//   This matches the write path in presign.ts — always orgId ?? userId.
//
// Returns null if:
//   - sessionId/peerId missing, or both userId and orgId missing
//   - timeline.json doesn't exist at the conventional R2 path (pipeline may
//     have failed timeline generation while still completing audio +
//     diarization + waveform — by design, timeline is non-fatal)
//   - the file is malformed JSON

import { env } from "cloudflare:workers";
import { timelineKey, type TimelineData } from "@/lib/postprocessing/timeline";

// Re-export the type as the "view" — same shape; alias purely for symmetry
// with how SessionWaveformView mirrors the on-disk format.
export type SessionTimelineView = TimelineData;

export async function getSessionTimeline(
  sessionId: string,
  userId:    string,
  orgId:     string,
  peerId:    string,
): Promise<SessionTimelineView | null> {
  if (!sessionId || (!userId && !orgId) || !peerId) return null;

  // ── Resolve path prefix ─────────────────────────────────────────────────
  // orgId is correct for new rooms. userId is the fallback for old rooms
  // created before orgId was stored. Matches presign.ts write path exactly.
  const pathId = orgId || userId;
  if (!pathId) return null;

  const key = timelineKey(pathId, sessionId, peerId);
  const obj = await (env as any).RECORDING_BUCKET.get(key);
  if (!obj) return null;

  try {
    const text = await obj.text();
    const data = JSON.parse(text) as TimelineData;

    // Light validation. If the structure is wrong (old version, corrupted),
    // return null rather than crashing the UI. Future: handle version
    // upgrades here (e.g. migrate v0 → v1 in-flight).
    if (typeof data.version !== "number" || !Array.isArray(data.speakers)) {
      console.warn(`[getSessionTimeline] malformed timeline.json at ${key}`);
      return null;
    }

    return data;
  } catch (err) {
    console.error(`[getSessionTimeline] failed to parse ${key}:`, err);
    return null;
  }
}