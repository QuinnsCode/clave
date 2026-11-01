// src/app/api/qlave/ice.ts
// GET /api/qlave/ice?roomCode=<code> → ICE servers for a hosted room.
// Requires a live room code so TURN credentials aren't handed to anyone who asks.

import { resolveRoom } from "@/lib/qlave/roomCode";
import { getIceServers } from "@/lib/qlave/ice";

export default async function handler({ request }: { request: Request }): Promise<Response> {
  const code = new URL(request.url).searchParams.get("roomCode");
  if (!code || !(await resolveRoom(code))) {
    return Response.json({ error: "Room not found" }, { status: 404 });
  }
  return Response.json(await getIceServers(), { headers: { "Cache-Control": "no-store" } });
}
