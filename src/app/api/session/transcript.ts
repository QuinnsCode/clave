// src/app/api/session/transcript.ts
// GET /api/session/transcript?sessionId=
// Returns saved transcript chunks for a session from D1.

import { db } from "@/db";

export default async function handler({ request, ctx }: { request: Request; ctx: any }): Promise<Response> {
  if (!ctx.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const url       = new URL(request.url);
  const sessionId = url.searchParams.get("sessionId");
  if (!sessionId) return Response.json({ error: "Missing sessionId" }, { status: 400 });

  try {
    const transcript = await db.sessionTranscript.findFirst({ where: { sessionId } });
    if (!transcript) return Response.json({ chunks: [] });
    return Response.json({ chunks: JSON.parse(transcript.chunks) });
  } catch {
    return Response.json({ chunks: [] });
  }
}