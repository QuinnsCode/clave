"use server";
// src/app/serverActions/pods/deletePod.ts

import { requestInfo } from "rwsdk/worker";
import {
  deletePodService,
  type ServiceResult,
} from "@/lib/pods/podsService";

export async function deletePod(podId: string): Promise<ServiceResult<{ deletedSessions: number }>> {
  const ctx = requestInfo.ctx;
  if (!ctx.user)         return { ok: false, error: "unauthorized" };
  if (!ctx.organization) return { ok: false, error: "no active organization" };

  return deletePodService({
    organizationId: ctx.organization.id,
    podId,
  });
}