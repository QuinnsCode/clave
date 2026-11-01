// src/lib/collab/capabilities.ts

export const CAPABILITIES = [
    "wb:draw",
    "wb:move_own",
    "wb:move_others",
    "wb:delete_own",
    "wb:delete_others",
    "wb:clear",
    "doc:create",
    "doc:edit",
    "doc:delete",
    "role:grant",
    "role:revoke",
  ] as const;
  
  export type Capability = typeof CAPABILITIES[number];
  
  export const ALL_CAPABILITIES: Capability[] = [...CAPABILITIES];
  
  // ── Default role presets ──────────────────────────────────────────────────────
  
  export const DEFAULT_ROLES: Record<string, Capability[]> = {
    host: ALL_CAPABILITIES,
    editor: [
      "wb:draw", "wb:move_own", "wb:move_others",
      "wb:delete_own", "wb:delete_others",
      "doc:create", "doc:edit", "doc:delete",
    ],
    member: [
      "wb:draw", "wb:move_own", "wb:delete_own",
      "doc:create", "doc:edit",
    ],
    guest: [
      "wb:draw",
    ],
  };
  
  // ── KV key helpers ────────────────────────────────────────────────────────────
  
  export const kvKeys = {
    sessionCaps: (sessionId: string, peerId: string) =>
      `collab:caps:${sessionId}:${peerId}`,
    orgRoles: (orgId: string) =>
      `collab:roles:${orgId}`,
    orgMembers: (orgId: string) =>
      `collab:members:${orgId}`,
  };
  
  // ── Resolver ──────────────────────────────────────────────────────────────────
  
  export interface OrgRoles {
    [roleName: string]: Capability[];
  }
  
  export interface OrgMembers {
    [userId: string]: string; // userId → roleName
  }
  
  export async function resolveCapabilities(
    kv:        KVNamespace,
    orgId:     string,
    userId:    string | null,
    isFounder: boolean,
    isOwner:   boolean,
  ): Promise<Capability[]> {
    // Founder and owner get everything
    if (isFounder || isOwner) return ALL_CAPABILITIES;
  
    // No user = guest
    if (!userId) return DEFAULT_ROLES.guest;
  
    // Load org config from KV
    const [rolesRaw, membersRaw] = await Promise.all([
      kv.get(kvKeys.orgRoles(orgId)),
      kv.get(kvKeys.orgMembers(orgId)),
    ]);
  
    const roles:   OrgRoles   = rolesRaw   ? JSON.parse(rolesRaw)   : DEFAULT_ROLES;
    const members: OrgMembers = membersRaw ? JSON.parse(membersRaw) : {};
  
    const roleName = members[userId] ?? "member";
    return roles[roleName] ?? DEFAULT_ROLES.member;
  }
  
  export function hasCap(caps: Capability[], cap: Capability): boolean {
    return caps.includes(cap);
  }
  
  export function canGrant(grantor: Capability[], target: Capability[]): boolean {
    // Can only grant caps you have
    return target.every(cap => grantor.includes(cap));
  }