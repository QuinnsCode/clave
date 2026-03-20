// src/lib/middleware.ts
// ─────────────────────────────────────────────────────────────────────────────
// ALL middleware in one place: route policies, CSP, headers, session, org.
//
// auth:
//   "none"     — skip session entirely (login, webhooks, public assets)
//   "optional" — read cookie if present → ctx.user, null if guest  ← DEFAULT
//   "required" — redirect to /user/login if no session
//
// org:
//   true  — subdomain lookup → ctx.organization + ctx.userRole     ← only on subdomain routes
//   false — skip                                                    ← DEFAULT
//
// av:
//   true  — camera/mic CSP + Permissions-Policy (WebRTC, AudioWorklet)
//   false — standard CSP                                           ← DEFAULT
//
// HOW TO ADD A ROUTE:
//   Add one line below. Only specify what differs from the default.
//   Default: { auth: "optional", org: false, av: false }
// ─────────────────────────────────────────────────────────────────────────────

import { type Organization, setupDb } from "@/db";
import type { AppContext } from "@/worker";
import { env } from "cloudflare:workers";
import { getCachedOrganization, getCachedMember } from "@/lib/cache/authCache";
import type { RouteMiddleware } from "rwsdk/worker";

// ── Types ─────────────────────────────────────────────────────────────────────

export type AuthLevel = "none" | "optional" | "required";

export interface RouteConfig {
  prefix: string;
  auth?:  AuthLevel; // default: "optional"
  org?:   boolean;   // default: false
  av?:    boolean;   // default: false
  force?: boolean;   // wins regardless of order
}

// ── Route table ───────────────────────────────────────────────────────────────
// First match wins. force: true entries always win first.
// Default if no match: { auth: "optional", org: false, av: false }

export const ROUTES: RouteConfig[] = [
  // ── Force overrides ────────────────────────────────────────────────────────
  { prefix: "/__draftsync",          auth: "required", org: true,  force: true },

  // ── No auth ────────────────────────────────────────────────────────────────
  { prefix: "/__",                   auth: "none"                  },
  { prefix: "/user/login",           auth: "none"                  },
  { prefix: "/user/signup",          auth: "none"                  },
  { prefix: "/user/forgot-password", auth: "none"                  },
  { prefix: "/user/reset-password",  auth: "none"                  },
  { prefix: "/user/logout",          auth: "none"                  },
  { prefix: "/api/auth/",            auth: "none"                  },
  { prefix: "/api/webhooks/",        auth: "none"                  },

  // ── Optional auth (guests welcome) ────────────────────────────────────────
  { prefix: "/s",                    auth: "optional", av: true     },
  { prefix: "/api/",                 auth: "optional"               },

  // ── Required auth + AV ────────────────────────────────────────────────────
  { prefix: "/qlave-test",           auth: "required", av: true,  org: true },
  { prefix: "/transcribe-test",      auth: "required", av: true,  org: true },

  // ── Required auth + org ───────────────────────────────────────────────────
  { prefix: "/dashboard",            auth: "required", org: true   },
];

// ── CSP presets ───────────────────────────────────────────────────────────────

const CSP = {
  default: `default-src 'self'; script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' wss: https:; media-src 'self' blob: https://*.r2.cloudflarestorage.com; frame-src https://challenges.cloudflare.com; object-src 'none';`,
  // AV + AI: camera, mic, AudioWorklet (blob:), WebRTC
  av: [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' blob: https://challenges.cloudflare.com https://static.cloudflareinsights.com",
    "script-src-elem 'self' 'unsafe-inline' blob: https://challenges.cloudflare.com https://static.cloudflareinsights.com",
    "worker-src blob: 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https:",
    "connect-src 'self' wss: https:",
    "media-src 'self' blob: https://*.r2.cloudflarestorage.com",
    "frame-src https://challenges.cloudflare.com",
    "object-src 'none'",
  ].join("; "),
} as const;

const PERMISSIONS = {
  deny: "geolocation=(), microphone=(), camera=()",
  av:   "camera=*, microphone=*",
} as const;

// ── Policy lookup ─────────────────────────────────────────────────────────────

export function getPolicy(pathname: string): Required<Omit<RouteConfig, "prefix" | "force">> {
  const forced = ROUTES.find(r => r.force && pathname.startsWith(r.prefix));
  const match  = forced ?? ROUTES.find(r => !r.force && pathname.startsWith(r.prefix));
  return {
    auth: match?.auth ?? "optional",
    org:  match?.org  ?? false,
    av:   match?.av   ?? false,
  };
}

export function getRouteHeaders(pathname: string): Record<string, string> {
  const { av } = getPolicy(pathname);
  return av
    ? { "Content-Security-Policy": CSP.av, "Permissions-Policy": PERMISSIONS.av }
    : { "Content-Security-Policy": CSP.default };
}

// ── DB init ───────────────────────────────────────────────────────────────────

let dbInitialized = false;

export async function initializeServices() {
  if (!dbInitialized) {
    await setupDb(env);
    dbInitialized = true;
  }
}

// ── Main middleware runner ────────────────────────────────────────────────────
// Call once per request. Populates ctx and returns a Response to short-circuit,
// or undefined to continue.

export async function runMiddleware(
  ctx: AppContext,
  request: Request
): Promise<Response | undefined> {
  const { pathname } = new URL(request.url);
  const policy = getPolicy(pathname);

  // 1. Session — skip entirely if auth: "none"
  if (policy.auth === "none") {
    ctx.session      = null;
    ctx.user         = null;
    ctx.organization = null;
    ctx.userRole     = null;
    ctx.orgError     = null;
    return;
  }

  // 2. Read session once
  try {
    const { initAuth } = await import("@/lib/auth");
    const session = await initAuth().api.getSession({ headers: request.headers });
    ctx.session = session;
    ctx.user    = session?.user as any ?? null;
  } catch {
    ctx.session = null;
    ctx.user    = null;
  }

  // 3. Auth guard — redirect if required and missing
  if (policy.auth === "required" && !ctx.user) {
    const url = new URL(request.url);
    return new Response(null, {
      status: 302,
      headers: { Location: `/user/login?next=${encodeURIComponent(url.pathname)}` },
    });
  }

  // 4. Org lookup — only if needed
  if (!policy.org) {
    ctx.organization = null;
    ctx.userRole     = null;
    ctx.orgError     = null;
    return;
  }

  await resolveOrgContext(ctx, request);
}

// ── Org context ───────────────────────────────────────────────────────────────

async function resolveOrgContext(ctx: AppContext, request: Request): Promise<void> {
  const orgSlug = extractOrgFromSubdomain(request);

  if (!orgSlug) {
    ctx.organization = null;
    ctx.userRole     = null;
    ctx.orgError     = null;
    return;
  }

  try {
    const organization = await getCachedOrganization(orgSlug);

    if (!organization) {
      ctx.organization = null;
      ctx.userRole     = null;
      ctx.orgError     = "ORG_NOT_FOUND";
      return;
    }

    if (ctx.user) {
      const membership = await getCachedMember(ctx.user.id, organization.id);
      if (!membership) {
        ctx.organization = organization;
        ctx.userRole     = null;
        ctx.orgError     = "NO_ACCESS";
        return;
      }
      ctx.userRole = membership.role;
    } else {
      ctx.userRole = null;
    }

    ctx.organization = organization;
    ctx.orgError     = null;

  } catch (e) {
    console.error("Org context error:", e);
    ctx.organization = null;
    ctx.userRole     = null;
    ctx.orgError     = "ERROR";
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function extractOrgFromSubdomain(request: Request): string | null {
  const { hostname } = new URL(request.url);
  const parts = hostname.split(".");

  let slug: string | null = null;

  if (hostname.includes("localhost")) {
    slug = parts.length >= 2 && parts[1] === "localhost" ? parts[0] : null;
  } else if (hostname.includes("workers.dev")) {
    slug = parts.length >= 4 ? parts[0] : null;
  } else {
    slug = parts.length >= 3 ? parts[0] : null;
  }

  if (!slug || slug === "www" || slug === "cdn") return null;
  if (!/^[a-z0-9-]+$/.test(slug)) return null;
  return slug;
}

export function isSandboxOrg(request: Request): boolean {
  const slug = extractOrgFromSubdomain(request);
  return ["sandbox", "default", "test", "trial"].includes(slug ?? "");
}

export const setCommonHeaders = (): RouteMiddleware =>
    ({ response }) => {
      response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
      response.headers.set("X-Content-Type-Options", "nosniff");
      response.headers.set("Referrer-Policy", "no-referrer");
    };