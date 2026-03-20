// lib/middleware/adminMiddleware.ts
// Gates /admin/* routes to the SUPER_ADMIN_EMAIL env var.
// Also enforces that admin is only accessible from the main domain —
// redirects subdomain hits to the main domain so cookies are valid.

import { env } from "cloudflare:workers";
import type { AppContext } from "@/worker";

export function requireAdmin(ctx: AppContext, request: Request): Response | null {
  // Enforce main domain — admin cookies won't exist on subdomains
  const url = new URL(request.url);
  const PRIMARY_DOMAIN = (env as any).PRIMARY_DOMAIN as string | undefined;

  if (PRIMARY_DOMAIN && !url.hostname.includes("localhost")) {
    const isMainDomain =
      url.hostname === PRIMARY_DOMAIN || url.hostname === `www.${PRIMARY_DOMAIN}`;

    if (!isMainDomain) {
      return new Response(null, {
        status: 302,
        headers: { Location: `${url.protocol}//${PRIMARY_DOMAIN}${url.pathname}${url.search}` },
      });
    }
  }

  const adminEmail = (env as any).SUPER_ADMIN_EMAIL as string | undefined;

  if (!adminEmail) {
    console.warn("[admin] SUPER_ADMIN_EMAIL not set — admin routes disabled");
    return notPermissioned();
  }

  if (!ctx.user || ctx.user.email !== adminEmail) {
    // If not logged in at all, send to login with next param
    if (!ctx.user) {
      return new Response(null, {
        status: 302,
        headers: { Location: `/user/login?next=${encodeURIComponent(url.pathname)}` },
      });
    }
    return notPermissioned();
  }

  return null; // allowed
}

function notPermissioned(): Response {
  return new Response(
    `<!DOCTYPE html><html><head><title>Not Permitted</title>
    <style>
      body { font-family: monospace; background: #080810; color: #444; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
      p { font-size: 13px; }
    </style></head>
    <body><p>not permissioned to view</p></body></html>`,
    { status: 403, headers: { "Content-Type": "text/html" } }
  );
}