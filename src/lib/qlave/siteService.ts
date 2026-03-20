// src/lib/qlave/siteService.ts

import { db } from "@/db";

export async function createSiteForUser(userId: string) {
  return db.site.create({
    data: {
      id: crypto.randomUUID(),
      siteKey: crypto.randomUUID(),
      userId,
    },
  });
}

export async function getOrCreateSite(userId: string) {
  const existing = await db.site.findFirst({
    where: { userId },
    select: { id: true, siteKey: true },
  });

  if (existing) return existing;

  const site = await createSiteForUser(userId);
  return { id: site.id, siteKey: site.siteKey };
}

export async function rotateSiteKey(userId: string) {
  const site = await db.site.findFirst({
    where: { userId },
    select: { id: true, siteKey: true },
  });

  if (!site) {
    // No site yet — create one instead of rotating
    const newSite = await createSiteForUser(userId);
    return { siteKey: newSite.siteKey };
  }

  const newKey = crypto.randomUUID();

  await db.site.update({
    where: { id: site.id },
    data: { siteKey: newKey },
  });

  return { siteKey: newKey, oldKey: site.siteKey };
}