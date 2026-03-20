// src/app/api/qlave/usage.ts
// Returns usage data for the dashboard — live sessions from KV, history from D1.

import { db } from "@/db";
import { env } from "cloudflare:workers";

export default async function ({ request, ctx }: { request: Request; ctx: any }) {
  if (!ctx.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Get this user's site
  const site = await db.site.findFirst({
    where: { userId: ctx.user.id },
    select: { siteKey: true },
  });

  if (!site) return Response.json({ error: "No site found" }, { status: 404 });

  const { siteKey } = site;

  // ── Live sessions from KV ──────────────────────────────────────────────────
  let activeSessions: any[] = [];
  try {
    const list = await (env as any).RATELIMIT_KV.list({ prefix: `usage:site:${siteKey}:session:` });
    const values = await Promise.all(
      list.keys.map(async (k: { name: string }) => {
        const val = await (env as any).RATELIMIT_KV.get(k.name, "json");
        return val;
      })
    );
    activeSessions = values.filter(Boolean);
  } catch (e) {
    console.error("KV usage read failed:", e);
  }

  // ── Historical sessions from D1 ────────────────────────────────────────────
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [recentSessions, monthlyStats] = await Promise.all([
    // Last 10 sessions
    db.qlaveSessionLog.findMany({
      where: { siteKey },
      orderBy: { startedAt: "desc" },
      take: 10,
      select: {
        sessionId: true,
        startedAt: true,
        endedAt: true,
        peakPeers: true,
        messageCount: true,
        durationMs: true,
      },
    }),

    // Aggregate for current month
    db.qlaveSessionLog.aggregate({
      where: {
        siteKey,
        startedAt: { gte: startOfMonth },
      },
      _sum: { messageCount: true, durationMs: true },
      _max: { peakPeers: true },
      _count: { id: true },
    }),
  ]);

  return Response.json({
    activeSessions,
    recentSessions,
    monthly: {
      sessionCount: monthlyStats._count.id,
      totalMessages: monthlyStats._sum.messageCount ?? 0,
      totalDurationMs: monthlyStats._sum.durationMs ?? 0,
      peakPeers: monthlyStats._max.peakPeers ?? 0,
    },
  });
}