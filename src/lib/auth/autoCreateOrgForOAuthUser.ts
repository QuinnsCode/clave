// lib/auth/autoCreateOrgForOAuthUser.ts
import { db } from "@/db";
import { getTierPlugins } from "@/lib/tiers";

/**
 * Automatically creates an organization for OAuth users on first sign-in.
 * Also activates trial plugins so the user has a working product immediately.
 */
export async function autoCreateOrgForOAuthUser(
  user: { id: string; email: string; name: string | null }
): Promise<void> {
  try {
    // Safety check — shouldn't happen but guard anyway
    const existingMembership = await db.member.findFirst({
      where: { userId: user.id }
    });

    if (existingMembership) {
      console.log('✅ User already has org, skipping auto-create');
      return;
    }

    console.log('🏰 Auto-creating organization for user:', user.email);

    // Generate unique slug from email prefix
    const emailPrefix = user.email.split('@')[0];
    let baseSlug = emailPrefix
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 20);

    if (baseSlug.length < 3) baseSlug = `user-${baseSlug}`;

    let slug = baseSlug;
    let counter = 1;
    let slugExists = await db.organization.findUnique({ where: { slug } });
    while (slugExists) {
      slug = `${baseSlug}-${counter++}`;
      slugExists = await db.organization.findUnique({ where: { slug } });
    }

    // Create org
    const org = await db.organization.create({
      data: {
        id:        crypto.randomUUID(),
        name:      `${user.name || user.email.split('@')[0]}'s Workspace`,
        slug,
        metadata:  JSON.stringify({ isPersonal: true, createdAt: new Date().toISOString() }),
        createdAt: new Date(),
      }
    });

    // Add user as owner
    await db.member.create({
      data: {
        id:             crypto.randomUUID(),
        userId:         user.id,
        organizationId: org.id,
        role:           'owner',
        createdAt:      new Date(),
      }
    });

    // ── Activate trial plugins ────────────────────────────────────────────────
    // Reads from tiers.ts — single source of truth.
    // When trial config changes, all new signups get the new config automatically.

    const trialPlugins = getTierPlugins('trial') as Record<string, any>;

    await Promise.all(
      Object.entries(trialPlugins).map(([plugin, config]) => {
        if (!config || typeof config !== 'object') return Promise.resolve();
        if (plugin === 'rooms') return Promise.resolve(); // rooms not a plugin row

        const enabled = config.enabled ?? false;

        return db.orgPlugin.upsert({
          where:  { organizationId_plugin: { organizationId: org.id, plugin } },
          create: {
            id:             crypto.randomUUID(),
            organizationId: org.id,
            plugin,
            enabled,
            mode:           'trial',
            tier:           'trial',
            config:         JSON.stringify(config),
            createdAt:      new Date(),
            updatedAt:      new Date(),
          },
          update: { enabled, mode: 'trial', tier: 'trial', config: JSON.stringify(config) },
        });
      })
    );

    console.log(`✅ Org created: ${org.id} (${slug}), trial plugins activated`);
  } catch (error) {
    console.error('❌ Failed to auto-create org:', error);
    // Don't throw — middleware will redirect to create-lair as fallback
  }
}