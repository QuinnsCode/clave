// src/lib/qlave/validateSiteKey.ts
// Validates a siteKey against the Site table.
// KV cache first (5 min TTL), D1 fallback.

import { env } from "cloudflare:workers";
import { db } from "@/db";
import { initializeServices } from "@/lib/middlewareFunctions";

const KV_TTL_SECONDS = 300; // 5 minutes
const KV_PREFIX = "qlave:site:";

export interface SiteRecord {
  id: string;
  userId: string;
  organizationId: string | null;
  domains: string;
}

export async function validateSiteKey(siteKey: string): Promise<SiteRecord | null> {
  
  //double check for middleware
  await initializeServices();


  if (!siteKey) return null;

  // platform bypass
  if (siteKey === "platform") {
    return { id: "platform", userId: "platform", organizationId: null, domains: "*" };
  }


  const kvKey = `${KV_PREFIX}${siteKey}`;

  // ── KV cache ────────────────────────────────────────────────
  try {
    const cached = await (env as any).AUTH_CACHE_KV.get(kvKey, "json") as SiteRecord | null;
    if (cached) return cached;
  } catch {
    // KV miss or error — fall through to D1
  }

  // ── D1 fallback ─────────────────────────────────────────────
  try {
    // D1 select
    const site = await db.site.findUnique({
      where: { siteKey },
      select: { id: true, userId: true, organizationId: true, domains: true },
    });

    if (!site) return null;

    const record: SiteRecord = {
      id: site.id,
      userId: site.userId,
      organizationId: site.organizationId,
      domains: site.domains,
    };

    // Write back to KV
    try {
      await (env as any).AUTH_CACHE_KV.put(kvKey, JSON.stringify(record), {
        expirationTtl: KV_TTL_SECONDS,
      });
    } catch { /**/ }

    return record;
  } catch {
    return null;
  }
}

// Stub — enforce in Phase 9
export function isDomainAllowed(_domains: string, _origin: string | null): boolean {
  return true;
}