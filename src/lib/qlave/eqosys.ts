// src/lib/qlave/eqosys.ts
// Verifies eqosys tokens (ES256 JWTs) so any Q app can call Qlave's headless
// API with the token it already holds. Same contract as TokenChecker in
// @rustybuns/util/token: one JWKS per isolate, refetched on an unknown kid.
//
// Env:
//   EQOSYS_ISSUER     default https://eqosys.qntbr.com
//   QLAVE_EQOSYS_APPS comma-separated eqosys app ids allowed to use Qlave (aud)

import { env } from "cloudflare:workers";

export interface EqosysClaims {
  iss: string;
  aud: string;
  sub: string;
  exp: number;
  email?: string;
  name?: string;
  source?: string;
  access?: string[];
}

const JWKS_TTL_MS = 5 * 60 * 1000;
let cache: { at: number; keys: Map<string, CryptoKey> } | null = null;

function issuer(): string {
  return ((env as any).EQOSYS_ISSUER ?? "https://eqosys.qntbr.com").replace(/\/$/, "");
}

export function allowedApps(): string[] {
  return String((env as any).QLAVE_EQOSYS_APPS ?? "").split(",").map(s => s.trim()).filter(Boolean);
}

async function loadKeys(force = false): Promise<Map<string, CryptoKey>> {
  if (!force && cache && Date.now() - cache.at < JWKS_TTL_MS) return cache.keys;
  const res = await fetch(`${issuer()}/.well-known/jwks.json`);
  if (!res.ok) throw new Error(`eqosys JWKS ${res.status}`);
  const { keys = [] } = await res.json() as { keys?: (JsonWebKey & { kid?: string })[] };
  const map = new Map<string, CryptoKey>();
  for (const jwk of keys) {
    if (jwk.kty !== "EC" || jwk.crv !== "P-256") continue;
    const k = await crypto.subtle.importKey("jwk", { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y }, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    map.set(jwk.kid ?? "", k);
  }
  cache = { at: Date.now(), keys: map };
  return map;
}

function unb64url(s: string): Uint8Array<ArrayBuffer> {
  const pad = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  return Uint8Array.from(atob(pad), c => c.charCodeAt(0));
}

/** Returns claims for a valid token whose aud is an allowed app, else null. */
export async function verifyEqosysToken(token: string): Promise<EqosysClaims | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const header = JSON.parse(new TextDecoder().decode(unb64url(parts[0]))) as { alg?: string; kid?: string };
    if (header.alg !== "ES256") return null;

    let keys = await loadKeys();
    let k = keys.get(header.kid ?? "") ?? (header.kid ? undefined : keys.values().next().value);
    if (!k) { keys = await loadKeys(true); k = keys.get(header.kid ?? ""); }
    if (!k) return null;

    const ok = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" }, k,
      unb64url(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    );
    if (!ok) return null;

    const claims = JSON.parse(new TextDecoder().decode(unb64url(parts[1]))) as EqosysClaims;
    if (claims.iss?.replace(/\/$/, "") !== issuer()) return null;
    if (!claims.exp || claims.exp < Math.floor(Date.now() / 1000)) return null;
    if (!claims.sub || !allowedApps().includes(claims.aud)) return null;
    return claims;
  } catch {
    return null;
  }
}

export function bearer(request: Request): string | null {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : null;
}
