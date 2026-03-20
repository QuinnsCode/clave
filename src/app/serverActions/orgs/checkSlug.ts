"use server";
// src/app/serverActions/orgs/checkSlug.ts

import { db } from "@/db";

export async function checkSlug(slug: string): Promise<{ available: boolean }> {
  const existing = await db.organization.findUnique({ where: { slug } });
  return { available: !existing };
}