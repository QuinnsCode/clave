// src/lib/dashboard/loadDashboardData.ts

import { db } from "@/db";
import { getOrCreateSite } from "@/lib/qlave/siteService";
import { getTranscriptionPlugin, getRecordingPlugin } from "@/lib/plugins/resolver";
import { getTierPlugins } from "@/lib/tiers";
import { env } from "cloudflare:workers";
import type { ResolvedTranscriptionPlugin, ResolvedRecordingPlugin } from "@/lib/plugins/resolver";
import type { SessionEntry } from "@/app/components/DashboardClient/SessionList";
// NEW — artifact awareness for badges in session list rows.
import {
  getSessionsArtifacts,
  toPlain,
  type SessionArtifactsView,
} from "@/app/serverActions/diarization/getSessionArtifacts";

export interface DashboardData {
  site:              { id: string; siteKey: string } | null;
  plugin:            ResolvedTranscriptionPlugin | null;
  recordingPlugin:   ResolvedRecordingPlugin | null;
  maxPeers:          number;
  recentSessions:    SessionEntry[];
  // NEW — per-sessionId artifact state. Empty record if nothing fetched.
  // Plain object (not Map) so it serializes cleanly through the RSC boundary.
  artifactsBySession: Record<string, SessionArtifactsView[]>;
  monthly: {
    sessionCount:    number;
    totalMessages:   number;
    totalDurationMs: number;
    peakPeers:       number;
  };
  errors: {
    plugins:   boolean;
    sessions:  boolean;
    artifacts: boolean;   // NEW — fetch can fail without blocking the page
  };
}

export async function loadDashboardData(userId: string, organizationId: string | null): Promise<DashboardData> {
  const result: DashboardData = {
    site:               null,
    plugin:             null,
    recordingPlugin:    null,
    maxPeers:           4,
    recentSessions:     [],
    artifactsBySession: {},   // NEW
    monthly:            { sessionCount: 0, totalMessages: 0, totalDurationMs: 0, peakPeers: 0 },
    errors:             { plugins: false, sessions: false, artifacts: false },
  };

  // ── Plugins + tier ────────────────────────────────────────────────────────
  try {
    const [site, plugin, recordingPlugin] = await Promise.all([
      getOrCreateSite(userId),
      organizationId ? getTranscriptionPlugin(db, organizationId, env.RATELIMIT_KV) : null,
      organizationId ? getRecordingPlugin(db, organizationId) : null,
    ]);

    result.site            = site;
    result.plugin          = plugin;
    result.recordingPlugin = recordingPlugin;
    result.maxPeers        = (getTierPlugins(plugin?.tier ?? "free") as any).rooms?.maxPeers ?? 4;
  } catch (err) {
    console.error("[loadDashboardData] plugins failed:", err);
    result.errors.plugins = true;
  }

  // ── Sessions ──────────────────────────────────────────────────────────────
  if (result.site) {
    try {
      const now          = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      const [rawSessions, monthlyStats] = await Promise.all([
        db.qlaveSessionLog.findMany({
          where:   { siteKey: result.site.siteKey },
          orderBy: { startedAt: "desc" },
          take:    50,
          select:  { sessionId: true, startedAt: true, endedAt: true, peakPeers: true, messageCount: true, durationMs: true },
        }),
        db.qlaveSessionLog.aggregate({
          where: { siteKey: result.site.siteKey, startedAt: { gte: startOfMonth } },
          _sum:  { messageCount: true, durationMs: true },
          _max:  { peakPeers: true },
          _count: { id: true },
        }),
      ]);

      const sessionIds = rawSessions.map(s => s.sessionId);

      // CHANGED — added artifact bulk fetch alongside the existing transcript/
      // summary lookups. All three run in parallel against D1; one extra query
      // for the whole page (not per-row).
      const [transcripts, summaries, artifactsMap] = await Promise.all([
        db.sessionTranscript.findMany({ where: { sessionId: { in: sessionIds } }, select: { sessionId: true } }),
        db.sessionSummary.findMany({   where: { sessionId: { in: sessionIds } }, select: { sessionId: true } }),
        getSessionsArtifacts(sessionIds),   // NEW
      ]);

      const transcriptSet = new Set(transcripts.map(t => t.sessionId));
      const summarySet    = new Set(summaries.map(s => s.sessionId));

      result.recentSessions = rawSessions.map(s => ({
        ...s,
        hasTranscript: transcriptSet.has(s.sessionId),
        hasSummary:    summarySet.has(s.sessionId),
        roomCode:      null as string | null,
      }));

      // NEW — flatten Map → plain object for RSC boundary. Sessions with no
      // diarization rows are absent from the map; the client treats those as
      // "all artifacts missing" (renders outlined badges).
      result.artifactsBySession = toPlain(artifactsMap);

      result.monthly = {
        sessionCount:    monthlyStats._count.id,
        totalMessages:   monthlyStats._sum.messageCount  ?? 0,
        totalDurationMs: monthlyStats._sum.durationMs    ?? 0,
        peakPeers:       monthlyStats._max.peakPeers     ?? 0,
      };
    } catch (err) {
      console.error("[loadDashboardData] sessions failed:", err);
      result.errors.sessions = true;
    }
  }

  return result;
}