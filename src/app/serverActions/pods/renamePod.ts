"use server";
// src/app/serverActions/pods/renamePod.ts

import { requestInfo } from "rwsdk/worker";
import {
  renamePodService,
  type ServiceResult,
  type PodSummary,
} from "@/lib/pods/podsService";

export async function renamePod(
  podId:   string,
  newName: string,
): Promise<ServiceResult<PodSummary>> {
  const ctx = requestInfo.ctx;
  if (!ctx.user)         return { ok: false, error: "unauthorized" };
  if (!ctx.organization) return { ok: false, error: "no active organization" };

  return renamePodService({
    organizationId: ctx.organization.id,
    podId,
    newName,
  });
}