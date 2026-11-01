// src/app/api/qlave/testTicket.ts
// POST /api/qlave/test-ticket { sessionId, name } → join ticket for the /qlave-test page.
// Signed-in users only. Rooms are namespaced "test-*" so they can never reach a real session.

import { signTicket } from "@/lib/qlave/tickets";
import { getIceServers } from "@/lib/qlave/ice";

export default async function handler({ request, ctx }: { request: Request; ctx: any }): Promise<Response> {
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
  if (!ctx.user) return Response.json({ error: "Sign in to use the test room" }, { status: 401 });

  const body = await request.json().catch(() => ({})) as { sessionId?: string; name?: string };
  const slug = String(body.sessionId ?? "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 40);
  if (!slug) return Response.json({ error: "Session ID required" }, { status: 400 });

  const sid = `test-${slug}`;
  const name = String(body.name ?? ctx.user.name ?? "Tester").slice(0, 64);
  const ticket = await signTicket({ sid, sub: ctx.user.id, name, app: null, maxPeers: 8 });
  const { iceServers } = await getIceServers();

  const u = new URL(request.url);
  const proto = u.protocol === "https:" ? "wss:" : "ws:";
  return Response.json({
    sessionId: sid,
    signalingUrl: `${proto}//${u.host}/__qlave/${sid}?ticket=${encodeURIComponent(ticket)}`,
    iceServers,
  });
}
