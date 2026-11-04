// src/lib/qlave/signalingGate.ts
// Authenticates the /__qlave/<sessionId> upgrade before it reaches the DO.
// Two ways in:
//   ?roomCode=<code>  hosted rooms (/s/:code): the code is the capability, and
//                     it must resolve to this very sessionId
//   ?ticket=<qt1...>  headless API: a signed ticket minted for this sessionId
// The DO gets the verified context in x-qlave-auth and trusts nothing else.

import { resolveRoom } from "@/lib/qlave/roomCode";
import { verifyTicket } from "@/lib/qlave/tickets";
import type { QlaveAuthContext } from "@/durableObjects/qlaveSessionDO";

export async function authorizeSignaling(request: Request, sessionId: string): Promise<QlaveAuthContext | Response> {
  const url = new URL(request.url);
  const ticket = url.searchParams.get("ticket");
  const roomCode = url.searchParams.get("roomCode");
  // Voice rooms only open through /__qlave/voice, which runs their kick and ticket checks.
  if (sessionId.startsWith("voice:")) return new Response("Use /__qlave/voice", { status: 403 });

  if (ticket) {
    const claims = await verifyTicket(ticket, sessionId);
    if (!claims || claims.voice) return new Response("Invalid or expired ticket", { status: 401 });
    return { sessionId, siteKey: claims.app ? `app:${claims.app}` : null, maxPeers: claims.maxPeers, userId: claims.sub, app: claims.app ?? null };
  }

  if (roomCode) {
    const room = await resolveRoom(roomCode);
    if (!room || room.sessionId !== sessionId) return new Response("Room not found or expired", { status: 404 });
    return { sessionId, roomCode, siteKey: room.siteKey, maxPeers: room.plugins?.config?.maxPeers, userId: room.userId, app: null };
  }

  return new Response("Unauthorized", { status: 401 });
}

/** Forward the upgrade to the DO with the verified context attached (incoming x-qlave-* stripped). */
export function forwardToSession(request: Request, auth: QlaveAuthContext): Request {
  const headers = new Headers(request.headers);
  for (const k of [...headers.keys()]) if (k.startsWith("x-qlave-")) headers.delete(k);
  headers.set("x-qlave-auth", JSON.stringify(auth));
  return new Request(request, { headers });
}
