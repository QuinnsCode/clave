// src/lib/pods/podsService.ts
//
// Service layer for Pod + Anchor CRUD. Pure async functions, no auth —
// callers (page loaders, server actions, future API routes) handle authn/authz
// before invoking these. The service trusts its inputs and only does data
// work. All functions take `organizationId` so cross-tenant access is
// impossible at the service level.
//
// CHANGED (R1.5 no-loop pass) — listPodsService now returns anchors[]
// alongside the summary data. The /pods page server-renders the whole tree
// in one round trip; PodDetailModal no longer needs to fetch anchors via
// useEffect. Old PodDetail type kept as a re-export alias since it's now
// identical to PodListItem for v1 (sessions list deferred).

import { db } from "@/db";
import { generatePodName, podSlug } from "./naming";

// ── Shapes returned to callers ──────────────────────────────────────────────

export interface PodSummary {
  id:        string;
  name:      string;
  slug:      string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AnchorItem {
  id:        string;
  canonical: string;
  createdAt: Date;
}

// CHANGED — anchors are now part of the list payload (server-rendered).
export interface PodListItem extends PodSummary {
  sessionCount: number;
  anchorCount:  number;
  anchors:      AnchorItem[];   // NEW (R1.5 no-loop pass)
}

// PodDetail is identical to PodListItem for v1. Kept as a separate name so
// PodDetailView's prop type stays semantic ("this is the detail view") and
// so it can grow (sessions[] etc.) without breaking the list view.
export type PodDetail = PodListItem;

export interface ServiceResult<T = unknown> {
  ok:    boolean;
  data?: T;
  error?: string;
}

// ── createPod ───────────────────────────────────────────────────────────────

const MAX_NAME_RETRIES = 5;

export async function createPodService(args: {
  organizationId: string;
  name?:          string;
}): Promise<ServiceResult<PodSummary>> {
  const { organizationId } = args;
  if (!organizationId) return { ok: false, error: "missing organizationId" };

  let name = args.name?.trim() || generatePodName();
  let slug = podSlug(name);

  // Resolve collision: retry with fresh random names if auto-named,
  // suffix with " 2" / " 3" if user explicitly named.
  for (let attempt = 0; attempt < MAX_NAME_RETRIES; attempt++) {
    const existing = await db.pod.findUnique({
      where:  { organizationId_slug: { organizationId, slug } },
      select: { id: true },
    });
    if (!existing) break;

    if (args.name) {
      name = `${args.name.trim()} ${attempt + 2}`;
      slug = podSlug(name);
    } else {
      name = generatePodName();
      slug = podSlug(name);
    }
  }

  const row = await db.pod.create({
    data:   { organizationId, name, slug },
    select: { id: true, name: true, slug: true, createdAt: true, updatedAt: true },
  });

  return { ok: true, data: row };
}

// ── listPods ────────────────────────────────────────────────────────────────
// CHANGED (R1.5 no-loop pass) — now eagerly loads anchors per pod. Trade-off:
// slightly larger /pods payload (~50 bytes per anchor) for ZERO client-side
// fetches when opening the detail modal. Worth it for v1 (anchors are short
// strings, pod count is bounded). Revisit if pods grow >100 with heavy
// anchor lists.

export async function listPodsService(organizationId: string): Promise<PodListItem[]> {
  if (!organizationId) return [];

  const rows = await db.pod.findMany({
    where:   { organizationId },
    orderBy: { updatedAt: "desc" },                    // most-recently-touched first
    select: {
      id:        true,
      name:      true,
      slug:      true,
      createdAt: true,
      updatedAt: true,
      _count:    { select: { sessions: true, anchors: true } },
      anchors: {
        orderBy: { createdAt: "asc" },
        select:  { id: true, canonical: true, createdAt: true },
      },
    },
  });

  return rows.map(r => ({
    id:           r.id,
    name:         r.name,
    slug:         r.slug,
    createdAt:    r.createdAt,
    updatedAt:    r.updatedAt,
    sessionCount: r._count.sessions,
    anchorCount:  r._count.anchors,
    anchors:      r.anchors,
  }));
}

// ── getPodWithDetailsService ────────────────────────────────────────────────
// Single fetch for the future /pods/:slug detail page. Today the /pods page
// already loads everything via listPodsService, so this isn't used in the
// flow. Kept for future detail-page wiring.

export async function getPodWithDetailsService(args: {
  organizationId: string;
  podId:          string;
}): Promise<ServiceResult<PodDetail>> {
  const { organizationId, podId } = args;

  const row = await db.pod.findFirst({
    where: { id: podId, organizationId },
    select: {
      id:        true,
      name:      true,
      slug:      true,
      createdAt: true,
      updatedAt: true,
      _count:    { select: { sessions: true, anchors: true } },
      anchors:   {
        orderBy: { createdAt: "asc" },
        select:  { id: true, canonical: true, createdAt: true },
      },
    },
  });
  if (!row) return { ok: false, error: "pod not found" };

  return {
    ok: true,
    data: {
      id:           row.id,
      name:         row.name,
      slug:         row.slug,
      createdAt:    row.createdAt,
      updatedAt:    row.updatedAt,
      sessionCount: row._count.sessions,
      anchorCount:  row._count.anchors,
      anchors:      row.anchors,
    },
  };
}

// ── renamePod ───────────────────────────────────────────────────────────────
// Hard-fails on slug collision. User chose the name explicitly; we don't
// silently suffix it.

export async function renamePodService(args: {
  organizationId: string;
  podId:          string;
  newName:        string;
}): Promise<ServiceResult<PodSummary>> {
  const { organizationId, podId, newName } = args;
  const trimmed = newName.trim();
  if (!trimmed) return { ok: false, error: "name is required" };
  if (trimmed.length > 64) return { ok: false, error: "name too long (max 64 chars)" };

  const existing = await db.pod.findFirst({
    where:  { id: podId, organizationId },
    select: { id: true, name: true },
  });
  if (!existing) return { ok: false, error: "pod not found" };

  const newSlug = podSlug(trimmed);

  // Collision check — but allow renaming to itself (same id).
  const collision = await db.pod.findUnique({
    where:  { organizationId_slug: { organizationId, slug: newSlug } },
    select: { id: true },
  });
  if (collision && collision.id !== podId) {
    return { ok: false, error: "name already in use" };
  }

  const row = await db.pod.update({
    where:  { id: podId },
    data:   { name: trimmed, slug: newSlug },
    select: { id: true, name: true, slug: true, createdAt: true, updatedAt: true },
  });

  return { ok: true, data: row };
}

// ── deletePod ───────────────────────────────────────────────────────────────
// Cascading deletion of D1 rows. R2 artifacts are LEFT IN PLACE (orphaned but
// harmless; cleanup job is future work).

export async function deletePodService(args: {
  organizationId: string;
  podId:          string;
}): Promise<ServiceResult<{ deletedSessions: number }>> {
  const { organizationId, podId } = args;

  const pod = await db.pod.findFirst({
    where:  { id: podId, organizationId },
    select: { id: true },
  });
  if (!pod) return { ok: false, error: "pod not found" };

  const sessions = await db.qlaveSessionLog.findMany({
    where:  { podId },
    select: { sessionId: true, siteKey: true },
  });
  const sessionIds = sessions.map(s => s.sessionId);

  if (sessionIds.length > 0) {
    await db.sessionDiarization.deleteMany({ where: { sessionId: { in: sessionIds } } });
    await db.sessionTranscript.deleteMany({   where: { sessionId: { in: sessionIds } } });
    await db.sessionSummary.deleteMany({      where: { sessionId: { in: sessionIds } } });
    await db.recordingManifest.deleteMany({   where: { sessionId: { in: sessionIds } } });
    await db.qlaveSessionLog.deleteMany({     where: { podId } });
  }

  // PodAnchor cascades via FK (onDelete: Cascade in schema)
  await db.pod.delete({ where: { id: podId } });

  return { ok: true, data: { deletedSessions: sessions.length } };
}

// ── assignSessionToPod ──────────────────────────────────────────────────────

export async function assignSessionToPodService(args: {
  organizationId: string;
  sessionLogId:   string;
  podId:          string;
}): Promise<ServiceResult<{ previousPodId: string | null }>> {
  const { organizationId, sessionLogId, podId } = args;

  const pod = await db.pod.findFirst({
    where:  { id: podId, organizationId },
    select: { id: true },
  });
  if (!pod) return { ok: false, error: "pod not found or wrong org" };

  const log = await db.qlaveSessionLog.findUnique({
    where:  { id: sessionLogId },
    select: { id: true, siteKey: true, podId: true },
  });
  if (!log) return { ok: false, error: "session log not found" };

  const site = await db.site.findUnique({
    where:  { siteKey: log.siteKey },
    select: { organizationId: true },
  });
  if (!site || site.organizationId !== organizationId) {
    return { ok: false, error: "session log belongs to a different org" };
  }

  const previousPodId = log.podId;
  if (previousPodId === podId) {
    return { ok: true, data: { previousPodId } };
  }

  await db.qlaveSessionLog.update({
    where: { id: sessionLogId },
    data:  { podId },
  });

  return { ok: true, data: { previousPodId } };
}

// ════════════════════════════════════════════════════════════════════════════
// Anchor CRUD — pod-scoped vocabulary
// ════════════════════════════════════════════════════════════════════════════
//
// Anchors are canonical word/phrases the user has taught a Pod. At display
// time (R1) they're just data. In R2 they get fed to the diarization provider
// as a vocabulary boost so future sessions hear them correctly.

const ANCHOR_MAX_LENGTH = 64;

async function podBelongsToOrg(podId: string, organizationId: string): Promise<boolean> {
  const pod = await db.pod.findFirst({
    where:  { id: podId, organizationId },
    select: { id: true },
  });
  return !!pod;
}

// ── listAnchors ─────────────────────────────────────────────────────────────
// Kept for future flows that need a fresh list outside the /pods page render
// (e.g., a session drawer pulling anchors for a single pod). Not used by the
// /pods page anymore — anchors are server-rendered into the initial payload.

export async function listAnchorsService(args: {
  organizationId: string;
  podId:          string;
}): Promise<ServiceResult<AnchorItem[]>> {
  const { organizationId, podId } = args;
  if (!(await podBelongsToOrg(podId, organizationId))) {
    return { ok: false, error: "pod not found" };
  }

  const rows = await db.podAnchor.findMany({
    where:   { podId },
    orderBy: { createdAt: "asc" },
    select:  { id: true, canonical: true, createdAt: true },
  });
  return { ok: true, data: rows };
}

// ── createAnchor ────────────────────────────────────────────────────────────

export async function createAnchorService(args: {
  organizationId: string;
  podId:          string;
  canonical:      string;
}): Promise<ServiceResult<AnchorItem>> {
  const { organizationId, podId } = args;
  const canonical = args.canonical.trim();

  if (!canonical) return { ok: false, error: "canonical is required" };
  if (canonical.length > ANCHOR_MAX_LENGTH) {
    return { ok: false, error: `too long (max ${ANCHOR_MAX_LENGTH} chars)` };
  }

  if (!(await podBelongsToOrg(podId, organizationId))) {
    return { ok: false, error: "pod not found" };
  }

  const existing = await db.podAnchor.findUnique({
    where:  { podId_canonical: { podId, canonical } },
    select: { id: true },
  });
  if (existing) return { ok: false, error: "anchor already exists" };

  const row = await db.podAnchor.create({
    data:   { podId, canonical },
    select: { id: true, canonical: true, createdAt: true },
  });

  // Touch parent pod's updatedAt so the cards re-sort by recency.
  await db.pod.update({ where: { id: podId }, data: { updatedAt: new Date() } });

  return { ok: true, data: row };
}

// ── deleteAnchor ────────────────────────────────────────────────────────────

export async function deleteAnchorService(args: {
  organizationId: string;
  anchorId:       string;
}): Promise<ServiceResult<{ podId: string }>> {
  const { organizationId, anchorId } = args;

  const anchor = await db.podAnchor.findUnique({
    where:  { id: anchorId },
    select: { id: true, podId: true, pod: { select: { organizationId: true } } },
  });
  if (!anchor) return { ok: false, error: "anchor not found" };
  if (anchor.pod.organizationId !== organizationId) {
    return { ok: false, error: "wrong organization" };
  }

  await db.podAnchor.delete({ where: { id: anchorId } });

  await db.pod.update({ where: { id: anchor.podId }, data: { updatedAt: new Date() } });

  return { ok: true, data: { podId: anchor.podId } };
}