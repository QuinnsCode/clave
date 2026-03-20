"use server";

import { db } from "@/db";
import { getTierPlugins } from "@/lib/tiers";

export async function createOrgForNewUser(
  user: { id: string; email: string; name: string | null },
  orgName: string,
  slug: string
): Promise<void> {
  const org = await db.organization.create({
    data: {
      id:        crypto.randomUUID(),
      name:      orgName,
      slug,
      metadata:  JSON.stringify({ isPersonal: false, createdAt: new Date().toISOString() }),
      createdAt: new Date(),
    }
  });

  await db.member.create({
    data: {
      id:             crypto.randomUUID(),
      userId:         user.id,
      organizationId: org.id,
      role:           'owner',
      createdAt:      new Date(),
    }
  });

  const trialPlugins = getTierPlugins('trial') as Record<string, any>;

  await Promise.all(
    Object.entries(trialPlugins).map(([plugin, config]) => {
      if (!config || typeof config !== 'object') return Promise.resolve();
      if (plugin === 'rooms') return Promise.resolve();
      const enabled = config.enabled ?? false;
      return db.orgPlugin.upsert({
        where:  { organizationId_plugin: { organizationId: org.id, plugin } },
        create: { id: crypto.randomUUID(), organizationId: org.id, plugin, enabled, mode: 'trial', tier: 'trial', config: JSON.stringify(config), createdAt: new Date(), updatedAt: new Date() },
        update: { enabled, mode: 'trial', tier: 'trial', config: JSON.stringify(config) },
      });
    })
  );
}