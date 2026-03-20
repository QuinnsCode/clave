'use server'
// app/serverActions/admin/manageUser.ts

import { env } from "cloudflare:workers";
import { db } from "@/db";

type GrantableTier = "free" | "pro" | "creator"; // founder is CLI only

function isAdmin(callerEmail: string): boolean {
  const adminEmail = (env as any).SUPER_ADMIN_EMAIL as string | undefined;
  return !!adminEmail && callerEmail === adminEmail;
}

export async function searchUsers(
  callerEmail: string,
  query: string,
): Promise<{ users?: Array<{ id: string; email: string; name: string | null; createdAt: Date; tier: string }>; error?: string }> {
  if (!isAdmin(callerEmail)) return { error: "Not permitted" };
  if (!query || query.length < 2) return { users: [] };

  const users = await db.user.findMany({
    where: {
      OR: [
        { email: { contains: query } },
        { name:  { contains: query } },
      ],
    },
    take: 20,
    select: {
      id: true,
      email: true,
      name: true,
      createdAt: true,
      stripeSubscription: { select: { tier: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return {
    users: users.map(u => ({
      id:        u.id,
      email:     u.email ?? "",
      name:      u.name,
      createdAt: u.createdAt,
      tier:      u.stripeSubscription?.tier ?? "free",
    })),
  };
}

export async function setUserTier(
  callerEmail: string,
  targetUserId: string,
  tier: GrantableTier,
): Promise<{ success?: boolean; error?: string }> {
  if (!isAdmin(callerEmail)) return { error: "Not permitted" };

  // Never allow granting founder via this UI
  if ((tier as string) === "founder") return { error: "Founder tier must be granted via CLI" };

  // Get target user's org
  const member = await db.member.findFirst({
    where:   { userId: targetUserId },
    select:  { organizationId: true },
    orderBy: { createdAt: "asc" },
  });

  if (!member) return { error: "User has no organization" };

  // Update orgPlugin
  await db.orgPlugin.upsert({
    where:  { organizationId_plugin: { organizationId: member.organizationId, plugin: "transcription" } },
    create: {
      organizationId: member.organizationId,
      plugin:  "transcription",
      enabled: tier !== "free",
      mode:    tier !== "free" ? "active" : "sample",
      tier,
    },
    update: {
      enabled: tier !== "free",
      mode:    tier !== "free" ? "active" : "sample",
      tier,
    },
  });

  // Update or create stripeSubscription record to reflect tier
  await db.stripeSubscription.upsert({
    where:  { userId: targetUserId },
    create: { userId: targetUserId, tier, status: "active" },
    update: { tier },
  });

  console.log(`[admin] ${callerEmail} set ${targetUserId} → ${tier}`);
  return { success: true };
}