// src/app/api/qlave/rotateSiteKey.ts

import { rotateSiteKey } from "@/lib/qlave/siteService";
import { env } from "cloudflare:workers";

export default async function ({ request, ctx }: { request: Request; ctx: any }) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  if (!ctx.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { siteKey, oldKey } = await rotateSiteKey(ctx.user.id);

  // Bust KV cache for old key so it stops being valid immediately
  if (oldKey) {
    try {
      await (env as any).RATELIMIT_KV.delete(`qlave:site:${oldKey}`);
    } catch {
      // Non-fatal — KV TTL will expire it naturally
    }
  }

  return Response.json({ siteKey });
}