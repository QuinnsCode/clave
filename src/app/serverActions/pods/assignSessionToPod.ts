"use server";
// src/app/serverActions/pods/assignSessionToPod.ts

import { requestInfo } from "rwsdk/worker";
import {
  assignSessionToPodService,
  type ServiceResult,
} from "@/lib/pods/podsService";

export async function assignSessionToPod(
  sessionLogId: string,
  podId:        string,
): Promise<ServiceResult<{ previousPodId: string | null }>> {
  const ctx = requestInfo.ctx;
  if (!ctx.user)         return { ok: false, error: "unauthorized" };
  if (!ctx.organization) return { ok: false, error: "no active organization" };

  return assignSessionToPodService({
    organizationId: ctx.organization.id,
    sessionLogId,
    podId,
  });
}