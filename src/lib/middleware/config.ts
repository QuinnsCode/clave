// src/lib/middleware/config.ts
// ─────────────────────────────────────────────────────────────────────────────
// Single source of truth for route middleware policies.
//
// WHAT EACH LEVEL MEANS:
//   "public"      — no session, no org. fully unauthenticated.
//   "session"     — reads auth cookie → ctx.user. no org lookup.
//   "full"        — session + subdomain org lookup → ctx.user + ctx.organization
//
// HOW TO ADD A ROUTE:
//   1. Pick the right level
//   2. Add its prefix below
//   3. Done — no other files need changing
//
// CSP / HEADERS:
//   Declare per-route headers here too so worker.tsx stays clean.
// ─────────────────────────────────────────────────────────────────────────────

export type MiddlewareLevel = "public" | "session" | "full";

export interface RoutePolicy {
  level: MiddlewareLevel;
  headers?: Record<string, string>;
}

// ── CSP presets ───────────────────────────────────────────────────────────────

const CSP = {
  // Standard authenticated pages
  default: `default-src 'self'; script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' wss: https:; frame-src https://challenges.cloudflare.com; object-src 'none';`,

  // Unauthenticated session pages (no turnstile)
  session: `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' wss: https:; object-src 'none';`,

  // AV + AI pages: camera, mic, AudioWorklet (blob:), WebRTC, CF AI calls
  // blob: required for AudioWorklet inline script registration
  // worker-src blob: required for future AudioWorkletProcessor modules
  // media-src blob: required for local MediaStream playback (e.g. <video> srcObject)
  av: `default-src 'self'; script-src 'self' 'unsafe-inline' blob: https://challenges.cloudflare.com https://static.cloudflareinsights.com; script-src-elem 'self' 'unsafe-inline' blob: https://challenges.cloudflare.com https://static.cloudflareinsights.com; worker-src blob: 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' wss: https:; media-src blob: 'self'; frame-src https://challenges.cloudflare.com; object-src 'none';`,
} as const;

// ── Permissions-Policy presets ────────────────────────────────────────────────

const PERMISSIONS = {
  // Deny everything by default (set in setCommonHeaders, overridden per-route)
  deny: "geolocation=(), microphone=(), camera=()",

  // Full AV access — camera + mic for WebRTC + transcription
  av: "camera=*, microphone=*",
} as const;

// ── Policy bundles ────────────────────────────────────────────────────────────
//
// Compose these into ROUTE_POLICIES below.

const POLICY = {
  // Standard dashboard/app pages
  default: {
    level: "full" as const,
    headers: {
      "Content-Security-Policy": `default-src 'self'; script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' wss: https:; media-src 'self' blob: https://*.r2.cloudflarestorage.com; frame-src https://challenges.cloudflare.com; object-src 'none';`,
    },
  },  

  // AV + AI: video calls, transcription, any page using camera/mic/worklets
  avAi: {
    level: "full" as const,
    headers: {
      "Content-Security-Policy": CSP.av,
      "Permissions-Policy": PERMISSIONS.av,
    },
  },

  // AV + AI but public (no auth required) — e.g. /s/:code guest join
  avAiPublic: {
    level: "public" as const,
    headers: {
      "Content-Security-Policy": CSP.av,
      "Permissions-Policy": PERMISSIONS.av,
    },
  },
};

// ── Route policies ────────────────────────────────────────────────────────────
//
// Matched by prefix, first match wins.
// "force" entries always win regardless of order.

export const ROUTE_POLICIES: Array<{ prefix: string; policy: RoutePolicy; force?: boolean }> = [
  // ── Force overrides ────────────────────────────────────────────────────────
  { prefix: "/__draftsync",          policy: { level: "full" },           force: true },

  // ── Public — no auth at all ────────────────────────────────────────────────
  { prefix: "/__",                   policy: { level: "public" } },
  { prefix: "/user/login",           policy: { level: "public" } },
  { prefix: "/user/signup",          policy: { level: "public" } },
  { prefix: "/user/forgot-password", policy: { level: "public" } },
  { prefix: "/user/reset-password",  policy: { level: "public" } },
  { prefix: "/user/logout",          policy: { level: "public" } },
  { prefix: "/api/auth/",            policy: { level: "public" } },
  { prefix: "/api/webhooks/",        policy: { level: "public" } },
  { prefix: "/landing",              policy: { level: "public" } },

  // ── AV + AI routes ─────────────────────────────────────────────────────────
  { prefix: "/s",                    policy: POLICY.avAiPublic },
  { prefix: "/qlave-test",           policy: POLICY.avAi },
  { prefix: "/transcribe-test",      policy: POLICY.avAi },

  // ── Session only — ctx.user, no org ───────────────────────────────────────
  { prefix: "/api/",                 policy: { level: "session" } },

  // ── Full — ctx.user + ctx.organization ────────────────────────────────────
  { prefix: "/dashboard",            policy: POLICY.default },
];

// ── Lookup helpers ────────────────────────────────────────────────────────────

export function getPolicyForPath(pathname: string): RoutePolicy {
  // Force entries win first
  const forced = ROUTE_POLICIES.find(r => r.force && pathname.startsWith(r.prefix));
  if (forced) return forced.policy;

  // First prefix match
  const match = ROUTE_POLICIES.find(r => pathname.startsWith(r.prefix));

  // Default to full middleware for anything not explicitly configured
  return match?.policy ?? { level: "full" };
}

export function shouldSkipSession(pathname: string): boolean {
  return getPolicyForPath(pathname).level === "public";
}

export function shouldSkipOrg(pathname: string): boolean {
  const level = getPolicyForPath(pathname).level;
  return level === "public" || level === "session";
}

export function getRouteHeaders(pathname: string): Record<string, string> {
  return getPolicyForPath(pathname).headers ?? {};
}