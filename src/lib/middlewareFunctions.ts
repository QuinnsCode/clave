// src/lib/middlewareFunctions.ts
import { type Organization, setupDb } from "@/db";
import type { AppContext } from "@/worker";
import { env } from "cloudflare:workers";
import { checkRateLimit, getRateLimitHeaders } from "@/lib/rateLimit";
import { RateLimitScope } from "@/lib/rateLimit";
import { getCachedOrganization, getCachedMember } from "@/lib/cache/authCache";
import { shouldSkipSession, shouldSkipOrg } from "@/lib/middleware/config";

let dbInitialized = false;

export async function initializeServices() {
  if (!dbInitialized) {
    await setupDb(env);
    dbInitialized = true;
  }
}

export function isSandboxOrg(request: Request): boolean {
  const orgSlug = extractOrgFromSubdomain(request);
  return ["sandbox", "default", "test", "trial"].includes(orgSlug ?? "");
}

export async function rateLimitMiddleware(
  request: Request,
  scope: RateLimitScope
): Promise<Response | null> {
  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  const result = await checkRateLimit(scope, ip);
  if (!result.allowed) {
    const retryAfter = Math.ceil((result.resetAt - Date.now()) / 1000);
    return new Response("Rate limit exceeded", {
      status: 429,
      headers: { ...getRateLimitHeaders(result), "Retry-After": retryAfter.toString() },
    });
  }
  return null;
}

// ── Session context ───────────────────────────────────────────────────────────

export async function setupSessionContext(ctx: AppContext, request: Request) {
  const { pathname } = new URL(request.url);

  if (shouldSkipSession(pathname)) {
    ctx.session = null;
    ctx.user = null;
    return;
  }

  try {
    const { initAuth } = await import("@/lib/auth");
    const session = await initAuth().api.getSession({ headers: request.headers });
    ctx.session = session;
    ctx.user = session?.user as any;
  } catch {
    ctx.session = null;
    ctx.user = null;
  }
}

// ── Organization context ──────────────────────────────────────────────────────
//
// ⚠️ TESTED WORKING: March 2, 2026 @ 6:46 PM PST (commit b4d443e)
// Test checklist before changing:
//   1. qlave.dev/user/login → ryan.qlave.dev/dashboard
//   2. ryan.qlave.dev/ → ryan.qlave.dev/dashboard
//   3. Dashboard loads with org context

export async function setupOrganizationContext(ctx: AppContext, request: Request) {
  const { pathname } = new URL(request.url);

  if (shouldSkipOrg(pathname)) {
    ctx.organization = null;
    ctx.userRole = null;
    ctx.orgError = null;
    return;
  }

  const orgSlug = extractOrgFromSubdomain(request);

  if (!orgSlug) {
    ctx.organization = null;
    ctx.userRole = null;
    ctx.orgError = null;
    return;
  }

  try {
    // Sandbox orgs — public viewer access
    if (isSandboxOrg(request)) {
      const org = await getCachedOrganization(orgSlug);
      if (org) { ctx.organization = org; ctx.userRole = "viewer"; ctx.orgError = null; return; }
    }

    const organization = await getCachedOrganization(orgSlug);

    if (!organization) {
      ctx.organization = null;
      ctx.userRole = null;
      ctx.orgError = "ORG_NOT_FOUND";
      return;
    }

    if (ctx.user) {
      const membership = await getCachedMember(ctx.user.id, organization.id);
      if (!membership) {
        ctx.organization = organization;
        ctx.userRole = null;
        ctx.orgError = "NO_ACCESS";
        return;
      }
      ctx.userRole = membership.role;
    } else {
      ctx.userRole = null;
    }

    ctx.organization = organization;
    ctx.orgError = null;

  } catch (e) {
    console.error("Org context error:", e);
    ctx.organization = null;
    ctx.userRole = null;
    ctx.orgError = "ERROR";
  }
}

// ── Extract org slug ──────────────────────────────────────────────────────────

export function extractOrgFromSubdomain(request: Request): string | null {
  const { hostname } = new URL(request.url);
  const parts = hostname.split(".");

  let orgSlug: string | null = null;

  if (hostname.includes("localhost")) {
    orgSlug = parts.length >= 2 && parts[1] === "localhost" ? parts[0] : null;
  } else if (hostname.includes("workers.dev")) {
    orgSlug = parts.length >= 4 ? parts[0] : null;
  } else {
    orgSlug = parts.length >= 3 ? parts[0] : null;
  }

  if (!orgSlug || orgSlug === "www" || orgSlug === "cdn") return null;
  if (!/^[a-z0-9-]+$/.test(orgSlug)) return null;
  return orgSlug;
}

// ── Deprecated ────────────────────────────────────────────────────────────────

/** @deprecated Each setup function handles its own skipping via config.ts */
export function shouldSkipMiddleware(request: Request): boolean {
  const { pathname } = new URL(request.url);
  return shouldSkipSession(pathname) && shouldSkipOrg(pathname);
}