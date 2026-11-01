// src/lib/pods/loadPodsData.ts
//
// Page-level data loader for the /pods route. Mirrors the loadDashboardData
// pattern: one async call from the page, returns everything the page needs
// plus an errors block so the page can render gracefully even if part of
// the data fails to load.

import { listPodsService, type PodListItem } from "./podsService";

export interface PodsPageData {
  pods:    PodListItem[];
  errors: {
    pods: string | null;
  };
}

export async function loadPodsData(organizationId: string): Promise<PodsPageData> {
  const errors: PodsPageData["errors"] = { pods: null };

  let pods: PodListItem[] = [];
  try {
    pods = await listPodsService(organizationId);
  } catch (err) {
    console.error("[loadPodsData] listPodsService failed:", err);
    errors.pods = "Could not load pods — refresh to retry";
  }

  return { pods, errors };
}