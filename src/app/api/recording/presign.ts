// src/app/api/recording/presign.ts
// GET /api/recording/presign?sessionId=&roomCode=&peerId=&chunkIndex=&mimeType=
// Validates room has recording enabled, returns presigned R2 PUT URL.
// Stateless — no DO call, just KV room lookup + sign.

import { resolveRoom } from "@/lib/qlave/roomCode";
import { presignChunkUpload, chunkKey, extForMime, SUPPORTED_MIME_TYPES } from "@/lib/plugins/recording/r2";
import type { PresignResponse } from "@/lib/plugins/recording/types";
import { env } from "cloudflare:workers";

export default async function handler({ request }: { request: Request }): Promise<Response> {
  if (request.method !== "GET") {
    return Response.json({ ok: false, error: "Method not allowed" }, { status: 405 });
  }

  const url        = new URL(request.url);
  const sessionId  = url.searchParams.get("sessionId");
  const roomCode   = url.searchParams.get("roomCode");
  const peerId     = url.searchParams.get("peerId");
  const chunkIndexStr = url.searchParams.get("chunkIndex");
  const mimeType   = url.searchParams.get("mimeType") ?? "video/webm";

  // ── Validate params ───────────────────────────────────────────────────────
  if (!sessionId || !roomCode || !peerId) {
    return Response.json({ ok: false, error: "Missing sessionId, roomCode, or peerId" }, { status: 400 });
  }

  const chunkIndex = parseInt(chunkIndexStr ?? "0", 10);
  if (isNaN(chunkIndex) || chunkIndex < 0) {
    return Response.json({ ok: false, error: "Invalid chunkIndex" }, { status: 400 });
  }

  if (!SUPPORTED_MIME_TYPES.includes(mimeType)) {
    return Response.json({ ok: false, error: `Unsupported mimeType: ${mimeType}` }, { status: 400 });
  }

  // ── Resolve room → check recording enabled ────────────────────────────────
  const room = await resolveRoom(roomCode);
  if (!room) {
    return Response.json({ ok: false, error: "Room not found or expired" }, { status: 404 });
  }

  if (!room.plugins.recording?.enabled) {
    return Response.json({ ok: false, error: "Recording not enabled for this room" }, { status: 403 });
  }

  // ── US-only enforcement ───────────────────────────────────────────────────
  const country = request.headers.get("CF-IPCountry");
  if ((env as any).RECORDING_US_ONLY === "true" && country && country !== "US") {
    return Response.json({ ok: false, error: "Recording is currently only available in the US" }, { status: 403 });
  }

  // ── Build key + presign ───────────────────────────────────────────────────
  const orgId = room.userId ?? sessionId;
  const ext   = extForMime(mimeType);
  const r2Key = chunkKey(orgId, sessionId, peerId, chunkIndex, ext);

  const { uploadUrl, expiresAt } = await presignChunkUpload(env as any, r2Key, mimeType);

  const response: PresignResponse = { ok: true, uploadUrl, r2Key, expiresAt };
  return Response.json(response);
}