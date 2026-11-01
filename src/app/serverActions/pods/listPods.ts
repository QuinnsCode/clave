"use server";
// src/app/serverActions/pods/listPods.ts
//
// Server action wrapper. The /pods page calls listPodsService directly
// (server-to-server, no need for action wrapping). This wrapper exists
// for client-side callers that need a fresh list (e.g. dropdowns that
// re-fetch after a delete elsewhere).

import { requestInfo } from "rwsdk/worker";
import { listPodsService, type PodListItem } from "@/lib/pods/podsService";

export async function listPods(): Promise<PodListItem[]> {
  const ctx = requestInfo.ctx;
  if (!ctx.user || !ctx.organization) return [];
  return listPodsService(ctx.organization.id);
}