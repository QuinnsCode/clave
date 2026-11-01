// src/app/api/recording/presign.ts
// GET /api/recording/presign?sessionId=&roomCode=&peerId=&chunkIndex=&mimeType=&kind=
// Validates room has recording enabled, returns presigned R2 PUT URL.
// Stateless — no DO call, just KV room lookup + sign.
//
// kind param (optional, default "video"):
//   "video" → chunkKey()      → /chunks/000000.webm   (full A/V)
//   "audio" → audioChunkKey() → /audio/000000.webm    (audio-only for diarize)
//
// R2 path prefix:
//   Uses room.orgId if set (correct, org-scoped).
//   Falls back to room.userId for rooms created before orgId was stored.
//   Hard error if neither exists — never write to a null or sessionId path.
//
// Guests joining a session are fine — they join an existing room owned by
// the host. The path prefix is always the host's org/userId, never the guest's.

import { resolveRoom } from "@/lib/qlave/roomCode";
import { presignChunkUpload, chunkKey, audioChunkKey, extForMime, SUPPORTED_MIME_TYPES } from "@/lib/plugins/recording/r2";
import type { PresignResponse } from "@/lib/plugins/recording/types";
import { env } from "cloudflare:workers";

export default async function handler({ request }: { request: Request }): Promise<Response> {
  if (request.method !== "GET") {
    return Response.json({ ok: false, error: "Method not allowed" }, { status: 405 });
  }

  const url           = new URL(request.url);
  const sessionId     = url.searchParams.get("sessionId");
  const roomCode      = url.searchParams.get("roomCode");
  const peerId        = url.searchParams.get("peerId");
  const chunkIndexStr = url.searchParams.get("chunkIndex");
  const mimeType      = url.searchParams.get("mimeType") ?? "video/webm";
  // kind param. Defaults to "video" so existing clients work unchanged.
  // Clients requesting audio-only chunks for diarization pass kind=audio.
  const kind          = url.searchParams.get("kind") ?? "video";

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

  if (kind !== "video" && kind !== "audio") {
    return Response.json({ ok: false, error: `Invalid kind: ${kind}` }, { status: 400 });
  }

  // ── Resolve room → check recording enabled ────────────────────────────────
  const room = await resolveRoom(roomCode);
  if (!room) {
    return Response.json({ ok: false, error: "Room not found or expired" }, { status: 404 });
  }

  if (!room.plugins.recording?.enabled) {
    return Response.json({ ok: false, error: "Recording not enabled for this room" }, { status: 403 });
  }

  // ── Resolve path prefix ───────────────────────────────────────────────────
  // orgId is correct (org-scoped). userId is the fallback for old rooms created
  // before orgId was stored in the room record. Never fall back to sessionId —
  // that produces a garbage path and is always a bug.
  const pathId = room.orgId ?? room.userId;
  if (!pathId) {
    console.error(`[presign] room ${roomCode} has no orgId or userId — cannot build R2 path`);
    return Response.json({ ok: false, error: "Room owner could not be resolved" }, { status: 500 });
  }

  // ── US-only enforcement ───────────────────────────────────────────────────
  const country = request.headers.get("CF-IPCountry");
  if ((env as any).RECORDING_US_ONLY === "true" && country && country !== "US") {
    return Response.json({ ok: false, error: "Recording is currently only available in the US" }, { status: 403 });
  }

  // ── Build key + presign ───────────────────────────────────────────────────
  const ext   = extForMime(mimeType);
  const r2Key = kind === "audio"
    ? audioChunkKey(pathId, sessionId, peerId, chunkIndex, ext)
    : chunkKey(pathId, sessionId, peerId, chunkIndex, ext);

  const { uploadUrl, expiresAt } = await presignChunkUpload(env as any, r2Key, mimeType);

  const response: PresignResponse = { ok: true, uploadUrl, r2Key, expiresAt };
  return Response.json(response);
}