// src/lib/qlave/tickets.ts
// Short-lived, HMAC-signed join tickets for /__qlave/<sessionId>.
// Minted by the headless API (/api/v1/rooms/...) for a caller that has already
// proven who they are (eqosys token); the signaling socket only checks the ticket.

import { env } from "cloudflare:workers";

export interface TicketClaims {
  sid: string;          // session (DO) id
  sub: string | null;   // user id, if known
  name?: string;
  app?: string | null;  // eqosys app id the room belongs to
  maxPeers?: number;
  exp: number;          // unix seconds
}

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function unb64url(s: string): Uint8Array<ArrayBuffer> {
  const pad = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  return Uint8Array.from(atob(pad), c => c.charCodeAt(0));
}

function secret(): string {
  const s = (env as any).QLAVE_TICKET_SECRET ?? (env as any).BETTER_AUTH_SECRET;
  if (!s) throw new Error("QLAVE_TICKET_SECRET is not set");
  return s;
}

async function key(): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", enc.encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function signTicket(claims: Omit<TicketClaims, "exp">, ttlSeconds = 15 * 60): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify({ ...claims, exp: Math.floor(Date.now() / 1000) + ttlSeconds })));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await key(), enc.encode(body)));
  return `qt1.${body}.${b64url(sig)}`;
}

export async function verifyTicket(ticket: string, sessionId: string): Promise<TicketClaims | null> {
  const [v, body, sig] = ticket.split(".");
  if (v !== "qt1" || !body || !sig) return null;
  try {
    const ok = await crypto.subtle.verify("HMAC", await key(), unb64url(sig), enc.encode(body));
    if (!ok) return null;
    const claims = JSON.parse(new TextDecoder().decode(unb64url(body))) as TicketClaims;
    if (claims.sid !== sessionId) return null;
    if (claims.exp < Math.floor(Date.now() / 1000)) return null;
    return claims;
  } catch {
    return null;
  }
}
