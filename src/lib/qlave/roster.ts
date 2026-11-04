// src/lib/qlave/roster.ts
// Who is in each voice room, told to eqosys (rustybuns apps/eqosys/QLAVE.md §4).
// Whenever a room's set of people changes, the room POSTs
//   ${EQOSYS_ISSUER}/q/qlave/roster   { room, in: [{ sub, name }], at }
// signed with x-qlave-signature = hex HMAC-SHA256(raw body, QLAVE_ROSTER_SECRET).
// No secret, no POST. Best effort: a few retries, never throws.

export interface RosterEntry { sub: string; name: string }

const RETRY_DELAYS_MS = [300, 1000];   // up to 2 more tries after the first

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function hmacHex(secret: string, body: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("");
}

/** One entry per distinct sub, first name seen wins. */
export function rosterOf(people: RosterEntry[]): RosterEntry[] {
  const seen = new Map<string, RosterEntry>();
  for (const p of people) if (!seen.has(p.sub)) seen.set(p.sub, { sub: p.sub, name: p.name });
  return [...seen.values()];
}

export async function postRoster(env: { EQOSYS_ISSUER?: string; QLAVE_ROSTER_SECRET?: string }, room: string, people: RosterEntry[]): Promise<void> {
  const secret = env.QLAVE_ROSTER_SECRET;
  if (!secret) return;
  const base = (env.EQOSYS_ISSUER ?? "https://eqosys.qntbr.com").replace(/\/$/, "");
  const body = JSON.stringify({ room, in: rosterOf(people), at: Date.now() });
  const headers = { "content-type": "application/json", "x-qlave-signature": await hmacHex(secret, body) };
  for (let i = 0; i <= RETRY_DELAYS_MS.length; i++) {
    try {
      const res = await fetch(`${base}/q/qlave/roster`, { method: "POST", headers, body });
      if (res.ok) return;
      console.error(`[qlave/roster] ${room}: eqosys ${res.status}`);
    } catch (e) {
      console.error(`[qlave/roster] ${room}:`, e);
    }
    if (i < RETRY_DELAYS_MS.length) await sleep(RETRY_DELAYS_MS[i]);
  }
}
