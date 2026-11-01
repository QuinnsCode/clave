"use server";
// src/app/serverActions/pods/podSessions.ts
//
// Server actions for pod session listing and transcript search.
// Thin wrappers over podSessionsService — handle authz then delegate.

import {
  getPodSessionsService,
  searchPodTranscriptsService,
  getOrgSessionsNotInPodService,
  type PodSessionItem,
  type PodSearchResult,
  type SessionForAdd,
} from "@/lib/pods/podSessionsService";
import { assignSessionToPodService } from "@/lib/pods/podsService";

export async function getPodSessions(
  podId:          string,
  organizationId: string,
): Promise<PodSessionItem[]> {
  if (!podId || !organizationId) return [];
  try {
    return await getPodSessionsService(podId, organizationId);
  } catch (e) {
    console.error("[getPodSessions]", e);
    return [];
  }
}

export async function searchPodTranscripts(
  podId:          string,
  organizationId: string,
  query:          string,
): Promise<PodSearchResult[]> {
  if (!podId || !organizationId || !query.trim()) return [];
  try {
    return await searchPodTranscriptsService(podId, organizationId, query);
  } catch (e) {
    console.error("[searchPodTranscripts]", e);
    return [];
  }
}

export async function getSessionsToAdd(
  organizationId: string,
  podId:          string,
): Promise<SessionForAdd[]> {
  if (!organizationId || !podId) return [];
  try {
    return await getOrgSessionsNotInPodService(organizationId, podId);
  } catch (e) {
    console.error("[getSessionsToAdd]", e);
    return [];
  }
}

export async function addSessionToPod(
  organizationId: string,
  sessionLogId:   string,
  podId:          string,
): Promise<{ ok: boolean; error?: string }> {
  if (!organizationId || !sessionLogId || !podId) {
    return { ok: false, error: "missing required fields" };
  }
  try {
    const result = await assignSessionToPodService({ organizationId, sessionLogId, podId });
    return result.ok ? { ok: true } : { ok: false, error: result.error };
  } catch (e) {
    console.error("[addSessionToPod]", e);
    return { ok: false, error: "failed to add session" };
  }
}

export type { PodSessionItem, PodSearchResult, SessionForAdd };