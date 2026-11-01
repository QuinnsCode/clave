// src/app/serverActions/diarization/getSessionArtifacts.ts
//
// Returns artifact state per (session, peer, tag) for one OR many sessions
// in a single query. Designed for dashboard list views — pass an array of
// sessionIds, get back a map of session → artifact snapshot.
//
// READS FROM D1 ONLY. No R2 HEADs in the hot path — D1 is the source of
// truth for "does this artifact exist?" via the *_status fields populated
// by the pipeline harness (or the backfill script for legacy rows).
//
// If a session has multiple diarization rows (different providers, different
// tags), we surface them all and let the UI pick which to render.

import { db } from "@/db";

// ── Public types ────────────────────────────────────────────────────────────

export interface ArtifactStateView {
  // Per-artifact: did it produce successfully?
  audio:       { exists: boolean; bytes: number | null };
  waveform:    { exists: boolean; bytes: number | null };
  diarization: { exists: boolean; bytes: number | null };
  cleanup:     { exists: boolean; bytes: number | null };   // NEW (cleanup pass)
  timeline:    { exists: boolean; bytes: number | null };
}

export interface SessionArtifactsView {
  sessionId: string;
  peerId:    string;
  tag:       string;       // "nova3" | "grok" | ...
  provider:  string;       // full registry name
  status:    string;       // overall pipeline status: "queued" | "running" | "done" | "failed"
  artifacts: ArtifactStateView;
  // For UI sort / hover: when was the latest step generated?
  lastUpdatedAt: Date | null;
}

// One session can have multiple diarization rows (one per tag/provider).
// Map keyed by sessionId → array of views (usually length 1).
export type SessionArtifactsMap = Map<string, SessionArtifactsView[]>;

// ── Single-session shape (for SessionDrawer header use later) ──────────────

export interface SingleSessionArtifacts {
  sessionId: string;
  rows:      SessionArtifactsView[];
}

// ── Server actions ──────────────────────────────────────────────────────────

/**
 * Bulk fetch artifact state for many sessions at once. Used by the dashboard
 * session list to render badges per row in a single query.
 *
 * Returns a Map<sessionId, SessionArtifactsView[]>. Sessions with no
 * diarization row at all are absent from the map (caller treats as
 * "nothing exists yet").
 */
export async function getSessionsArtifacts(
  sessionIds: string[],
): Promise<SessionArtifactsMap> {
  if (sessionIds.length === 0) return new Map();

  const rows = await db.sessionDiarization.findMany({
    where: { sessionId: { in: sessionIds } },
    select: {
      sessionId:       true,
      peerId:          true,
      tag:             true,
      provider:        true,
      status:          true,
      audioStatus:     true,
      audioBytes:      true,
      waveformStatus:  true,
      waveformBytes:   true,
      diarizationStatus: true,
      diarizationBytes: true,
      // NEW (cleanup pass) — cleanup_* fields added in migration 0027.
      // Cast through `any` below if the generated Prisma client hasn't
      // been regenerated post-migration; safest is to re-run prisma generate.
      cleanupStatus:   true,
      cleanupBytes:    true,
      timelineStatus:  true,
      timelineBytes:   true,
      // For lastUpdatedAt: max of any *_generated_at field
      audioGeneratedAt:       true,
      waveformGeneratedAt:    true,
      diarizationGeneratedAt: true,
      cleanupGeneratedAt:     true,   // NEW (cleanup pass)
      timelineGeneratedAt:    true,
    },
  });

  const map: SessionArtifactsMap = new Map();
  for (const row of rows) {
    const view: SessionArtifactsView = {
      sessionId: row.sessionId,
      peerId:    row.peerId,
      tag:       row.tag,
      provider:  row.provider,
      status:    row.status,
      artifacts: {
        audio: {
          exists: row.audioStatus === "done",
          bytes:  row.audioBytes,
        },
        waveform: {
          exists: row.waveformStatus === "done",
          bytes:  row.waveformBytes,
        },
        diarization: {
          exists: row.diarizationStatus === "done",
          bytes:  row.diarizationBytes,
        },
        cleanup: {
          // NEW (cleanup pass)
          exists: row.cleanupStatus === "done",
          bytes:  row.cleanupBytes,
        },
        timeline: {
          exists: row.timelineStatus === "done",
          bytes:  row.timelineBytes,
        },
      },
      lastUpdatedAt: maxDate([
        row.audioGeneratedAt,
        row.waveformGeneratedAt,
        row.diarizationGeneratedAt,
        row.cleanupGeneratedAt,   // NEW (cleanup pass)
        row.timelineGeneratedAt,
      ]),
    };

    const existing = map.get(row.sessionId);
    if (existing) existing.push(view);
    else          map.set(row.sessionId, [view]);
  }

  return map;
}

/**
 * Single-session fetch. Used by SessionDrawer header. Returns all
 * (peer, tag) variants for the session — caller decides which to display.
 */
export async function getSessionArtifacts(
  sessionId: string,
): Promise<SingleSessionArtifacts> {
  const map = await getSessionsArtifacts([sessionId]);
  return {
    sessionId,
    rows: map.get(sessionId) ?? [],
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function maxDate(dates: (Date | null | undefined)[]): Date | null {
  let best: Date | null = null;
  for (const d of dates) {
    if (!d) continue;
    if (!best || d > best) best = d;
  }
  return best;
}

// ── Convenience: serialize to plain JSON for RSC/client boundary ───────────
// Maps don't serialize over the RSC boundary; convert to a plain record.

export function toPlain(map: SessionArtifactsMap): Record<string, SessionArtifactsView[]> {
  return Object.fromEntries(map);
}