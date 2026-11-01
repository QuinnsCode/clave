// src/app/pages/qollab/QollabPage.tsx

import { env } from "cloudflare:workers";
import type { RequestInfo } from "rwsdk/worker";
import QollabClient from "@/app/components/qollab/QollabClient";
import { resolveCapabilities } from "@/lib/qollab/capabilities";

export default async function QollabPage({ ctx, params, request }: RequestInfo<{ sessionId: string }>) {
  if (!ctx.user) {
    return new Response(null, { status: 302, headers: { Location: "/user/login" } });
  }

  const sessionId = params.sessionId;
  const url       = new URL(request.url);
  const peerId    = url.searchParams.get("peerId") ?? crypto.randomUUID();
  const orgId     = ctx.organization?.id ?? ctx.user.id;
  const isFounder = (ctx.user as any)?.tier === "founder";

  let isOwner = false;
    try {
    const { db } = await import("@/db");
    const site = await db.site.findFirst({
        where:  { userId: ctx.user.id },
        select: { siteKey: true },
    });
    if (site) {
        // Check D1 first (ended sessions)
        const log = await db.qlaveSessionLog.findFirst({
        where:  { sessionId, siteKey: site.siteKey },
        select: { sessionId: true },
        });
        if (log) {
        isOwner = true;
        } else {
        // Check KV for live sessions not yet flushed
        const kvRaw = await env.RATELIMIT_KV.get(`usage:session:${sessionId}`);
        if (kvRaw) {
            const kvData = JSON.parse(kvRaw);
            isOwner = kvData.siteKey === site.siteKey;
        }
        }
    }
    } catch { /* non-fatal */ }

  let initialCaps = await resolveCapabilities(
    env.RATELIMIT_KV,
    orgId,
    ctx.user.id,
    isFounder,
    isOwner,
  );

  let initialObjects: any[] = [];
  let initialDocs:    any[] = [];
  let isLocked              = false;

  try {
    const id   = env.QOLLAB_WHITEBOARD_DO.idFromName(sessionId);
    const stub = env.QOLLAB_WHITEBOARD_DO.get(id);

    const [objects, docs, locked] = await Promise.all([
      stub.getWhiteboardState(),
      stub.getDocs(),
      stub.getIsLocked(),
    ]);

    initialObjects = objects;
    initialDocs    = docs;
    isLocked       = locked;

    if (isLocked) {
      initialCaps = [];
    } else {
      await stub.setPeerCaps(peerId, ctx.user.id, initialCaps);
    }
  } catch (e) {
    console.error("[QollabPage] DO fetch failed:", e);
  }

  return (
    <QollabClient
      sessionId={sessionId}
      peerId={peerId}
      userId={ctx.user.id}
      orgId={orgId}
      isOwner={isOwner}
      isFounder={isFounder}
      initialObjects={initialObjects}
      initialDocs={initialDocs}
      initialCaps={initialCaps}
      initialLocked={isLocked}
    />
  );
}