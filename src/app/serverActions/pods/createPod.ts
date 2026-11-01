"use server";
// src/app/serverActions/pods/createPod.ts
//
// Server action wrapper around createPodService. Reads auth from request
// context (RWSDK pattern) so the client doesn't pass orgId — preventing
// cross-tenant abuse via tampering.

import { requestInfo } from "rwsdk/worker";
import { createPodService } from "@/lib/pods/podsService";
import type { ServiceResult, PodSummary } from "@/lib/pods/podsService";

export async function createPod(name?: string): Promise<ServiceResult<PodSummary>> {
  const ctx = requestInfo.ctx;
  if (!ctx.user)         return { ok: false, error: "unauthorized" };
  if (!ctx.organization) return { ok: false, error: "no active organization" };

  return createPodService({
    organizationId: ctx.organization.id,
    name,
  });
}