// @/lib/middleware/autoCreateOrgMiddleware.ts
// Auto-creates an org for users who don't have one, and redirects logged-in
// users on the main domain to their org subdomain.
//
// Skips automatically for any route with org: false in middleware.ts ROUTES —
// no hardcoded prefix lists here.

import type { AppContext } from "@/worker";
import { db } from "@/db";
import { getCachedUserMemberships, invalidateMember } from "@/lib/cache/authCache";
import { autoCreateOrgForOAuthUser } from "@/lib/auth/autoCreateOrgForOAuthUser";
import { getPolicy } from "@/lib/middleware";

export async function autoCreateOrgMiddleware(
  ctx: AppContext,
  request: Request
): Promise<Response | null> {
  const { pathname } = new URL(request.url);

  // Skip if no user, or route policy doesn't need org context
  const policy = getPolicy(pathname);
  if (!ctx.user || !policy.org) return null;

  // Check if user has any orgs
  const memberships = await getCachedUserMemberships(ctx.user.id);

  // Case 1: User has org(s) but is on main domain → redirect to their org subdomain
  if (memberships.length > 0) {
    if (!hasSubdomain(request)) {
      const membership = await db.member.findFirst({
        where: { userId: ctx.user.id },
        include: { organization: true },
      });
      if (membership) {
        const redirectUrl = buildOrgRedirectUrl(membership.organization.slug ?? "", request);
        console.log("✅ [AUTO-REDIRECT] Redirecting to:", redirectUrl);
        return new Response(null, { status: 302, headers: { Location: redirectUrl } });
      }
    }
    return null;
  }

  // Case 2: User has no org → auto-create one
  console.log("⚠️ [AUTO-ORG] User has no org, auto-creating...");

  try {
    await autoCreateOrgForOAuthUser(ctx.user);

    const freshMemberships = await db.member.findMany({
      where: { userId: ctx.user.id },
      include: { organization: true },
      take: 1,
    });

    if (freshMemberships.length > 0) {
      const { id: orgId, slug: orgSlug } = freshMemberships[0].organization;
      await invalidateMember(ctx.user.id, orgId);
      const redirectUrl = buildOrgRedirectUrl(orgSlug ?? "", request);
      console.log("✅ [AUTO-ORG] Created and redirecting to:", redirectUrl);
      return new Response(null, { status: 302, headers: { Location: redirectUrl } });
    }
  } catch (error) {
    console.error("❌ [AUTO-ORG] Failed to auto-create:", error);
  }

  console.log("⚠️ [AUTO-ORG] Auto-create failed, redirecting to create-lair");
  return new Response(null, { status: 302, headers: { Location: "/user/create-lair" } });
}

function hasSubdomain(request: Request): boolean {
  const { hostname } = new URL(request.url);
  if (hostname.includes("localhost")) {
    return hostname.split(".").length >= 2 && hostname.split(".")[1] === "localhost";
  }
  if (hostname.includes("workers.dev")) return hostname.split(".").length >= 4;
  return hostname.split(".").length >= 3 && hostname !== "www.qlave.dev";
}

function buildOrgRedirectUrl(orgSlug: string, request: Request): string {
  const { hostname, protocol, port } = new URL(request.url);
  if (hostname.includes("localhost")) return `${protocol}//${orgSlug}.localhost:${port || "5173"}/dashboard`;
  if (hostname.includes("workers.dev")) return `${protocol}//${orgSlug}.${hostname.split(".").slice(-3).join(".")}/dashboard`;
  return `${protocol}//${orgSlug}.qlave.dev/dashboard`;
}