// src/app/api/v1/handlers.ts
// Headless Qlave: video rooms + speech-to-text for any eqosys app.
//
// Every call carries the app's eqosys token as a bearer (aud = the app id,
// which must be listed in QLAVE_EQOSYS_APPS). No cookies, so CORS is open.
//
//   POST /api/v1/rooms              { maxPeers?, name? }  → room + your join ticket
//   POST /api/v1/rooms/:id/join     { name? }             → join ticket for this room
//   GET  /api/v1/ice                                      → ICE servers (TURN when configured)
//   POST /api/v1/transcribe         TranscribeInput       → { ok, result }
//
// A room is scoped to the app that made it: a token for another app can't join.

import { env } from "cloudflare:workers";
import { verifyEqosysToken, bearer, type EqosysClaims } from "@/lib/qlave/eqosys";
import { signTicket } from "@/lib/qlave/tickets";
import { getIceServers } from "@/lib/qlave/ice";
import { transcribeAudio } from "@/lib/transcription/transcribe";

const ROOM_TTL_SECONDS = 24 * 60 * 60;
const MAX_PEERS_CAP = 16;
const DEFAULT_DAILY_STT_SECONDS = 60 * 60;
const MAX_AUDIO_BASE64 = 8 * 1024 * 1024; // ~6 MB of audio per chunk

interface V1Room { id: string; app: string; owner: string; maxPeers: number; createdAt: number }

const kv = () => (env as any).RATELIMIT_KV as KVNamespace;

export const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS } });
}

function fail(status: number, code: string, message: string): Response {
  return json({ ok: false, error: { code, message } }, status);
}

async function authed(request: Request): Promise<EqosysClaims | Response> {
  const token = bearer(request);
  if (!token) return fail(401, "NO_TOKEN", "Authorization: Bearer <eqosys token> required");
  const claims = await verifyEqosysToken(token);
  if (!claims) return fail(401, "BAD_TOKEN", "Token invalid, expired, or app not enabled for Qlave");
  return claims;
}

function signalingUrl(request: Request, roomId: string, ticket: string): string {
  const u = new URL(request.url);
  const proto = u.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${u.host}/__qlave/${roomId}?ticket=${encodeURIComponent(ticket)}`;
}

async function joinPayload(request: Request, room: V1Room, claims: EqosysClaims, name?: string) {
  const displayName = (name ?? claims.name ?? claims.email?.split("@")[0] ?? "Guest").slice(0, 64);
  const ticket = await signTicket({ sid: room.id, sub: claims.sub, name: displayName, app: room.app, maxPeers: room.maxPeers });
  const { iceServers, turn } = await getIceServers();
  return {
    ok: true,
    roomId: room.id,
    app: room.app,
    signalingUrl: signalingUrl(request, room.id, ticket),
    ticketExpiresIn: 15 * 60,
    iceServers,
    turn,
    name: displayName,
    expiresAt: room.createdAt + ROOM_TTL_SECONDS * 1000,
  };
}

export async function createRoomV1(request: Request): Promise<Response> {
  const claims = await authed(request);
  if (claims instanceof Response) return claims;
  const body = await request.json().catch(() => ({})) as { maxPeers?: number; name?: string };
  const room: V1Room = {
    id: crypto.randomUUID(),
    app: claims.aud,
    owner: claims.sub,
    maxPeers: Math.max(2, Math.min(MAX_PEERS_CAP, Number(body.maxPeers) || 8)),
    createdAt: Date.now(),
  };
  await kv().put(`v1room:${room.id}`, JSON.stringify(room), { expirationTtl: ROOM_TTL_SECONDS });
  return json(await joinPayload(request, room, claims, body.name), 201);
}

export async function joinRoomV1(request: Request, roomId: string): Promise<Response> {
  const claims = await authed(request);
  if (claims instanceof Response) return claims;
  const room = await kv().get<V1Room>(`v1room:${roomId}`, "json");
  if (!room) return fail(404, "NO_ROOM", "Room not found or expired");
  if (room.app !== claims.aud) return fail(403, "WRONG_APP", "This room belongs to another app");
  const body = await request.json().catch(() => ({})) as { name?: string };
  return json(await joinPayload(request, room, claims, body.name));
}

export async function iceV1(request: Request): Promise<Response> {
  const claims = await authed(request);
  if (claims instanceof Response) return claims;
  return json({ ok: true, ...(await getIceServers()) });
}

export async function transcribeV1(request: Request): Promise<Response> {
  const claims = await authed(request);
  if (claims instanceof Response) return claims;

  const input = await request.json().catch(() => null) as any;
  if (!input?.audioBase64 || !input?.mimeType) return fail(400, "INVALID_AUDIO", "audioBase64 and mimeType required");
  if (input.audioBase64.length > MAX_AUDIO_BASE64) return fail(413, "TOO_LARGE", "Chunk too large; send ≤30s chunks");

  // Per person per app per day. Rough by design: KV is eventually consistent.
  const day = new Date().toISOString().slice(0, 10);
  const userKey = `v1stt:${claims.aud}:${claims.sub}:${day}`;
  const cap = Number((env as any).QLAVE_V1_DAILY_STT_SECONDS) || DEFAULT_DAILY_STT_SECONDS;
  const used = Number(await kv().get(userKey)) || 0;
  if (used >= cap) return fail(402, "CAP_REACHED", "Daily transcription allowance used up");

  const model = ["whisper-large-v3-turbo", "whisper", "nova-3"].includes(input.model) ? input.model : "whisper-large-v3-turbo";
  let result;
  try {
    result = await transcribeAudio(env.TRANSCRIPTION_AI, {
      audioBase64: input.audioBase64,
      mimeType: input.mimeType,
      language: input.language,
      previousText: typeof input.previousText === "string" ? input.previousText.slice(-500) : undefined,
      chunkStartTime: input.chunkStartTime,
      model,
    } as any);
  } catch (e) {
    console.error("[v1/transcribe] model failed:", e);
    return fail(502, "MODEL_FAILED", "Transcription failed");
  }

  const secs = Math.ceil(result.durationSeconds || 0);
  if (secs > 0) {
    const appKey = `v1stt:${claims.aud}:_app:${day}`;
    const appUsed = Number(await kv().get(appKey)) || 0;
    await Promise.all([
      kv().put(userKey, String(used + secs), { expirationTtl: 3 * 86400 }),
      kv().put(appKey, String(appUsed + secs), { expirationTtl: 40 * 86400 }),
    ]);
  }
  return json({ ok: true, result });
}

export function preflight(): Response {
  return new Response(null, { status: 204, headers: CORS });
}
