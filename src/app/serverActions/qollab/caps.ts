"use server";
// src/app/serverActions/qollab/caps.ts
// Resolves capabilities from KV on peer join and sets them on the DO.

import { env } from "cloudflare:workers";
import {
  resolveCapabilities,
  kvKeys,
  type Capability,
  type OrgRoles,
  type OrgMembers,
  DEFAULT_ROLES,
} from "@/lib/qollab/capabilities";

function getStub(sessionId: string) {
  const id = env.QOLLAB_WHITEBOARD_DO.idFromName(sessionId);
  return env.QOLLAB_WHITEBOARD_DO.get(id);
}

// Called when a peer joins the session — resolves + sets their caps on the DO
export async function initPeerCaps(
  sessionId: string,
  peerId:    string,
  userId:    string | null,
  orgId:     string,
  isFounder: boolean,
  isOwner:   boolean,
): Promise<Capability[]> {
  const caps = await resolveCapabilities(
    env.RATELIMIT_KV,
    orgId,
    userId,
    isFounder,
    isOwner,
  );

  await getStub(sessionId).setPeerCaps(peerId, userId, caps);
  return caps;
}

// Grant caps to a peer mid-session
export async function grantPeerCaps(
  sessionId:     string,
  granterPeerId: string,
  targetPeerId:  string,
  caps:          Capability[],
): Promise<void> {
  return getStub(sessionId).grantCaps(granterPeerId, targetPeerId, caps);
}

// Revoke caps from a peer mid-session
export async function revokePeerCaps(
  sessionId:     string,
  revokerPeerId: string,
  targetPeerId:  string,
  caps:          Capability[],
): Promise<void> {
  return getStub(sessionId).revokeCaps(revokerPeerId, targetPeerId, caps);
}

// Org settings — save role definitions to KV
export async function saveOrgRoles(
  orgId: string,
  roles: OrgRoles,
): Promise<void> {
  await env.RATELIMIT_KV.put(kvKeys.orgRoles(orgId), JSON.stringify(roles));
}

// Org settings — save member→role assignments to KV
export async function saveOrgMembers(
  orgId:   string,
  members: OrgMembers,
): Promise<void> {
  await env.RATELIMIT_KV.put(kvKeys.orgMembers(orgId), JSON.stringify(members));
}

// Get org roles (for settings UI)
export async function getOrgRoles(orgId: string): Promise<OrgRoles> {
  const raw = await env.RATELIMIT_KV.get(kvKeys.orgRoles(orgId));
  return raw ? JSON.parse(raw) : DEFAULT_ROLES;
}

// Get org members (for settings UI)
export async function getOrgMembers(orgId: string): Promise<OrgMembers> {
  const raw = await env.RATELIMIT_KV.get(kvKeys.orgMembers(orgId));
  return raw ? JSON.parse(raw) : {};
}