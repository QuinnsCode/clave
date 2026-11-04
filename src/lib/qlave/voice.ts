// src/lib/qlave/voice.ts
// Qollab voice channels: Qlave's half of the contract in rustybuns
// apps/eqosys/QLAVE.md. eqosys says who someone is, the Space DO says who may
// be in which channel, Qlave carries the voice. Qlave never calls the space.
//
//   GET  /__qlave/voice?eqosys=<jwt>   join: an eqosys ES256 ticket (aud "qlave",
//                                      room, name, sub, jti, exp <= 60s), single use
//   GET  /__qlave/voice?resume=<qt1>   reconnect: the resume ticket the room handed out
//   POST /eqosys                       orders from eqosys (Bearer, aud "qlave-admin"):
//                                      mute | kick | erase | end
//
// A voice room is a normal QlaveSessionDO named "voice:<room>". Which rooms are
// live, and who is in which, is indexed in KV so erase and end can find them.
// Whenever a room's people change, the room POSTs them to eqosys
// (${EQOSYS_ISSUER}/q/qlave/roster, HMAC-signed with QLAVE_ROSTER_SECRET): src/lib/qlave/roster.ts.

import { env } from "cloudflare:workers";
import { verifyEqosysToken, bearer } from "@/lib/qlave/eqosys";
import { verifyTicket } from "@/lib/qlave/tickets";
import type { QlaveAuthContext } from "@/durableObjects/qlaveSessionDO";

export const VOICE_AUD = "qlave";
export const ADMIN_AUD = "qlave-admin";
const MAX_TICKET_LIFE_S = 120;   // contract says <= 60s; allow some clock skew
const MAX_ROOM_LEN = 200;

export const voiceSessionId = (room: string) => `voice:${room}`;
export const roomKey = (room: string) => `voice:room:${room}`;
export const subKey = (sub: string, room: string) => `voice:sub:${sub}:${room}`;

const validRoom = (room: unknown): room is string =>
  typeof room === "string" && room.length > 0 && room.length <= MAX_ROOM_LEN;

/** Authorize a /__qlave/voice upgrade. Returns the room's session id and the verified context. */
export async function authorizeVoice(request: Request): Promise<{ sessionId: string; auth: QlaveAuthContext } | Response> {
  const url = new URL(request.url);
  const jwt = url.searchParams.get("eqosys");
  const resume = url.searchParams.get("resume");

  if (jwt) {
    const c = await verifyEqosysToken(jwt, [VOICE_AUD]);
    if (!c || !validRoom(c.room)) return new Response("Invalid or expired ticket", { status: 401 });
    if (c.exp - Math.floor(Date.now() / 1000) > MAX_TICKET_LIFE_S) return new Response("Ticket lives too long", { status: 401 });
    const sessionId = voiceSessionId(c.room);
    return {
      sessionId,
      auth: {
        sessionId, siteKey: "app:qollab", userId: c.sub, app: "qollab",
        voice: { room: c.room, sub: c.sub, name: String(c.name ?? "").slice(0, 64) || "Guest", jti: c.jti ?? jwt.slice(-43), jtiExp: c.exp },
      },
    };
  }

  if (resume) {
    // The ticket names its session; check it against the room it claims.
    const sid = peekSid(resume);
    const t = sid?.startsWith("voice:") ? await verifyTicket(resume, sid) : null;
    if (!t || !t.voice || !t.sub) return new Response("Invalid or expired ticket", { status: 401 });
    const room = sid!.slice("voice:".length);
    return {
      sessionId: sid!,
      auth: {
        sessionId: sid!, siteKey: "app:qollab", userId: t.sub, app: "qollab",
        voice: { room, sub: t.sub, name: t.name ?? "Guest", resumedFrom: t.iatMs ?? 0 },
      },
    };
  }

  return new Response("Unauthorized", { status: 401 });
}

function peekSid(ticket: string): string | null {
  try {
    const body = ticket.split(".")[1];
    const json = atob(body.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((body.length + 3) % 4));
    const sid = JSON.parse(json).sid;
    return typeof sid === "string" ? sid : null;
  } catch { return null; }
}

// ── Orders from eqosys ────────────────────────────────────────────────────────

type Order =
  | { t: "mute"; room: string; sub: string; on: boolean }
  | { t: "kick"; room: string; sub: string }
  | { t: "erase"; sub: string }
  | { t: "end"; prefix: string };

/** POST /eqosys. 200 once the order is done (or there was nothing to do); eqosys retries anything else. */
export async function handleEqosysOrder(request: Request): Promise<Response> {
  if (request.method !== "POST") return new Response("POST only", { status: 405 });
  const token = bearer(request);
  const claims = token ? await verifyEqosysToken(token, [ADMIN_AUD]) : null;
  if (!claims) return new Response("Unauthorized", { status: 401 });

  let o: Order;
  try { o = await request.json(); } catch { return new Response("Bad JSON", { status: 400 }); }

  try {
    switch (o?.t) {
      case "mute":
        if (!validRoom(o.room) || !o.sub || typeof o.on !== "boolean") break;
        await toRoom(o.room, { t: "mute", sub: o.sub, on: o.on });
        return Response.json({ ok: true });
      case "kick":
        if (!validRoom(o.room) || !o.sub) break;
        await toRoom(o.room, { t: "kick", sub: o.sub });
        return Response.json({ ok: true });
      case "erase": {
        if (!o.sub) break;
        const rooms = await listRooms(`voice:sub:${o.sub}:`);
        await Promise.all(rooms.map(room => toRoom(room, { t: "kick", sub: o.sub, reason: "erased" })));
        return Response.json({ ok: true, rooms: rooms.length });
      }
      case "end": {
        // An empty prefix would end every room on Qlave.
        if (typeof o.prefix !== "string" || o.prefix.length < 3) break;
        const rooms = await listRooms(roomKey(o.prefix));
        await Promise.all(rooms.map(room => toRoom(room, { t: "end" })));
        return Response.json({ ok: true, rooms: rooms.length });
      }
    }
  } catch (e) {
    console.error("[qlave/voice] order failed:", e);
    return new Response("Order failed", { status: 500 });
  }
  return new Response("Bad order", { status: 400 });
}

/** Rooms under a KV prefix; the room name is whatever follows the matching key's prefix part. */
async function listRooms(prefix: string): Promise<string[]> {
  const kv = (env as any).RATELIMIT_KV as KVNamespace;
  const isSub = prefix.startsWith("voice:sub:");
  const strip = isSub ? prefix.length : "voice:room:".length;
  const rooms: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await kv.list({ prefix, cursor });
    for (const k of page.keys) rooms.push(k.name.slice(strip));
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return rooms;
}

async function toRoom(room: string, order: Record<string, unknown>): Promise<void> {
  const ns = (env as any).QLAVE_SESSION_DO as DurableObjectNamespace;
  const res = await ns.get(ns.idFromName(voiceSessionId(room))).fetch("https://qlave-internal/admin", {
    method: "POST",
    headers: { "x-qlave-admin": "1", "content-type": "application/json" },
    body: JSON.stringify(order),
  });
  if (!res.ok) throw new Error(`room ${room}: ${res.status}`);
}
