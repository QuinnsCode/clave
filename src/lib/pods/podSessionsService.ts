// src/lib/pods/podSessionsService.ts
//
// Service functions for pod session listing and transcript search.
// All functions are pure async — no auth, callers handle authz.
//
// Transcript normalization:
//   Both SessionDiarization.transcript (plain text) and SessionTranscript.chunks
//   (JSON array of {peerId, displayName, text, timestamp}) are normalized to
//   plain text lines: "DisplayName: text" when speaker is known, "text" otherwise.
//   This keeps search result rendering simple — components receive strings only.

import { db } from "@/db";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PodSessionItem {
  id:               string;  // QlaveSessionLog.id
  sessionId:        string;
  startedAt:        Date;
  endedAt:          Date | null;
  durationMs:       number | null;
  peakPeers:        number;
  // Transcript source and preview
  transcriptSource: "diarization" | "live" | "none";
  transcriptPreview: string | null;  // first 150 chars of normalized text
  // Diarization metadata
  hasDiarization:   boolean;
  speakerCount:     number | null;
  diarizationStatus: string | null;
}

export interface SearchResultContext {
  before: string[];   // up to 3 lines before the match
  match:  string;     // the matching line
  after:  string[];   // up to 3 lines after the match
}

export interface PodSearchResult {
  sessionLogId:     string;
  sessionId:        string;
  startedAt:        Date;
  transcriptSource: "diarization" | "live";
  contexts:         SearchResultContext[];  // one per match found in this session
}

// ── Normalization ─────────────────────────────────────────────────────────────

/**
 * Normalize a SessionTranscript.chunks JSON string to plain text lines.
 * Format: "DisplayName: text" when displayName is present, else just "text".
 */
function normalizeChunksToLines(chunksJson: string): string[] {
  try {
    const chunks = JSON.parse(chunksJson) as {
      peerId?: string;
      displayName?: string;
      text?: string;
    }[];
    return chunks
      .map(c => {
        const text = c.text?.trim();
        if (!text) return null;
        const speaker = c.displayName?.trim() || c.peerId?.slice(0, 8);
        return speaker ? `${speaker}: ${text}` : text;
      })
      .filter((l): l is string => l !== null);
  } catch {
    return [];
  }
}

/**
 * Normalize a SessionDiarization.transcript plain text to lines.
 * Already plain text — just split on newlines and filter empties.
 */
function normalizeDiarizationToLines(transcript: string): string[] {
  return transcript
    .split("\n")
    .map(l => l.trim())
    .filter(Boolean);
}

/**
 * Find all lines matching a query (case-insensitive) and return context windows.
 */
function extractContextWindows(
  lines:        string[],
  query:        string,
  contextSize:  number = 3,
): SearchResultContext[] {
  const lowerQuery = query.toLowerCase();
  const results: SearchResultContext[] = [];

  lines.forEach((line, i) => {
    if (!line.toLowerCase().includes(lowerQuery)) return;
    results.push({
      before: lines.slice(Math.max(0, i - contextSize), i),
      match:  line,
      after:  lines.slice(i + 1, i + 1 + contextSize),
    });
  });

  return results;
}

// ── getPodSessionsService ─────────────────────────────────────────────────────

export async function getPodSessionsService(
  podId:          string,
  organizationId: string,
): Promise<PodSessionItem[]> {
  // Verify pod belongs to org
  const pod = await db.pod.findFirst({
    where:  { id: podId, organizationId },
    select: { id: true },
  });
  if (!pod) return [];

  const logs = await db.qlaveSessionLog.findMany({
    where:   { podId },
    orderBy: { startedAt: "desc" },
    select: {
      id:           true,
      sessionId:    true,
      startedAt:    true,
      endedAt:      true,
      durationMs:   true,
      peakPeers:    true,
    },
  });

  if (logs.length === 0) return [];

  const sessionIds = logs.map(l => l.sessionId);

  // Fetch diarizations — prefer "done" status, pick first per session
  const diarizations = await db.sessionDiarization.findMany({
    where:   { sessionId: { in: sessionIds }, status: "done" },
    orderBy: { completedAt: "desc" },
    select: {
      sessionId:    true,
      transcript:   true,
      speakerCount: true,
      status:       true,
    },
  });

  // Fetch live transcripts
  const liveTranscripts = await db.sessionTranscript.findMany({
    where:  { sessionId: { in: sessionIds } },
    select: { sessionId: true, chunks: true },
  });

  // Index by sessionId — first diarization wins per session
  const diarMap = new Map<string, typeof diarizations[0]>();
  diarizations.forEach(d => {
    if (!diarMap.has(d.sessionId)) diarMap.set(d.sessionId, d);
  });

  const liveMap = new Map<string, string>();
  liveTranscripts.forEach(t => liveMap.set(t.sessionId, t.chunks));

  return logs.map(log => {
    const diar = diarMap.get(log.sessionId);
    const live = liveMap.get(log.sessionId);

    let transcriptSource: PodSessionItem["transcriptSource"] = "none";
    let transcriptPreview: string | null = null;
    let speakerCount: number | null = null;

    if (diar?.transcript) {
      transcriptSource = "diarization";
      const lines = normalizeDiarizationToLines(diar.transcript);
      transcriptPreview = lines.join(" ").slice(0, 150) || null;
      speakerCount = diar.speakerCount ?? null;
    } else if (live) {
      transcriptSource = "live";
      const lines = normalizeChunksToLines(live);
      transcriptPreview = lines.join(" ").slice(0, 150) || null;
    }

    return {
      id:                log.id,
      sessionId:         log.sessionId,
      startedAt:         log.startedAt,
      endedAt:           log.endedAt,
      durationMs:        log.durationMs,
      peakPeers:         log.peakPeers,
      transcriptSource,
      transcriptPreview,
      hasDiarization:    !!diar,
      speakerCount,
      diarizationStatus: diar?.status ?? null,
    };
  });
}

// ── searchPodTranscriptsService ───────────────────────────────────────────────
// SQLite LIKE search across both transcript types within a pod.
// Returns one result per session with all matching context windows.

export async function searchPodTranscriptsService(
  podId:          string,
  organizationId: string,
  query:          string,
): Promise<PodSearchResult[]> {
  if (!query.trim()) return [];

  const pod = await db.pod.findFirst({
    where:  { id: podId, organizationId },
    select: { id: true },
  });
  if (!pod) return [];

  const logs = await db.qlaveSessionLog.findMany({
    where:   { podId },
    select:  { id: true, sessionId: true, startedAt: true },
    orderBy: { startedAt: "desc" },
  });

  if (logs.length === 0) return [];

  const sessionIds = logs.map(l => l.sessionId);
  const logMap = new Map(logs.map(l => [l.sessionId, l]));

  // Search diarizations first (plain text LIKE)
  const diarHits = await db.sessionDiarization.findMany({
    where: {
      sessionId:  { in: sessionIds },
      status:     "done",
      transcript: { contains: query },
    },
    select: { sessionId: true, transcript: true },
    orderBy: { completedAt: "desc" },
  });

  // Collect session IDs already covered by diarization
  const diarSessionIds = new Set(diarHits.map(d => d.sessionId));

  // Search live transcripts for sessions without diarization hits
  const remainingIds = sessionIds.filter(id => !diarSessionIds.has(id));
  const liveHits = remainingIds.length > 0
    ? await db.sessionTranscript.findMany({
        where: {
          sessionId: { in: remainingIds },
          chunks:    { contains: query },
        },
        select: { sessionId: true, chunks: true },
      })
    : [];

  const results: PodSearchResult[] = [];

  // Process diarization hits
  for (const hit of diarHits) {
    if (!hit.transcript) continue;
    const log = logMap.get(hit.sessionId);
    if (!log) continue;

    const lines    = normalizeDiarizationToLines(hit.transcript);
    const contexts = extractContextWindows(lines, query);
    if (contexts.length === 0) continue;

    results.push({
      sessionLogId:     log.id,
      sessionId:        hit.sessionId,
      startedAt:        log.startedAt,
      transcriptSource: "diarization",
      contexts,
    });
  }

  // Process live transcript hits
  for (const hit of liveHits) {
    const log = logMap.get(hit.sessionId);
    if (!log) continue;

    const lines    = normalizeChunksToLines(hit.chunks);
    const contexts = extractContextWindows(lines, query);
    if (contexts.length === 0) continue;

    results.push({
      sessionLogId:     log.id,
      sessionId:        hit.sessionId,
      startedAt:        log.startedAt,
      transcriptSource: "live",
      contexts,
    });
  }

  return results;
}

// ── getOrgSessionsNotInPodService ─────────────────────────────────────────────
// Sessions belonging to this org that aren't in the given pod.
// Used for the "add session" flow — browse + preview before adding.

export interface SessionForAdd {
  id:               string;  // QlaveSessionLog.id
  sessionId:        string;
  startedAt:        Date;
  durationMs:       number | null;
  peakPeers:        number;
  currentPodId:     string | null;
  currentPodName:   string | null;
  transcriptSource: "diarization" | "live" | "none";
  transcriptPreview: string | null;
}

export async function getOrgSessionsNotInPodService(
  organizationId: string,
  podId:          string,
  limit:          number = 50,
): Promise<SessionForAdd[]> {
  // Get all siteKeys for this org
  const sites = await db.site.findMany({
    where:  { organizationId },
    select: { siteKey: true },
  });
  const siteKeys = sites.map(s => s.siteKey);
  if (siteKeys.length === 0) return [];

  const logs = await db.qlaveSessionLog.findMany({
    where: {
      siteKey: { in: siteKeys },
      OR: [
        { podId: null },
        { podId: { not: podId } },
      ],
    },
    orderBy: { startedAt: "desc" },
    take:    limit,
    select: {
      id:        true,
      sessionId: true,
      startedAt: true,
      durationMs: true,
      peakPeers: true,
      podId:     true,
      pod:       { select: { name: true } },
    },
  });

  if (logs.length === 0) return [];

  const sessionIds = logs.map(l => l.sessionId);

  const diarizations = await db.sessionDiarization.findMany({
    where:   { sessionId: { in: sessionIds }, status: "done" },
    select:  { sessionId: true, transcript: true },
    orderBy: { completedAt: "desc" },
  });

  const liveTranscripts = await db.sessionTranscript.findMany({
    where:  { sessionId: { in: sessionIds } },
    select: { sessionId: true, chunks: true },
  });

  const diarMap = new Map<string, string>();
  diarizations.forEach(d => {
    if (!diarMap.has(d.sessionId) && d.transcript) {
      diarMap.set(d.sessionId, d.transcript);
    }
  });

  const liveMap = new Map<string, string>();
  liveTranscripts.forEach(t => liveMap.set(t.sessionId, t.chunks));

  return logs.map(log => {
    const diar = diarMap.get(log.sessionId);
    const live = liveMap.get(log.sessionId);

    let transcriptSource: SessionForAdd["transcriptSource"] = "none";
    let transcriptPreview: string | null = null;

    if (diar) {
      transcriptSource  = "diarization";
      transcriptPreview = normalizeDiarizationToLines(diar).join(" ").slice(0, 150) || null;
    } else if (live) {
      transcriptSource  = "live";
      transcriptPreview = normalizeChunksToLines(live).join(" ").slice(0, 150) || null;
    }

    return {
      id:               log.id,
      sessionId:        log.sessionId,
      startedAt:        log.startedAt,
      durationMs:       log.durationMs,
      peakPeers:        log.peakPeers,
      currentPodId:     log.podId ?? null,
      currentPodName:   log.pod?.name ?? null,
      transcriptSource,
      transcriptPreview,
    };
  });
}