"use server";
// src/app/serverActions/pods/listAnchors.ts

import { requestInfo } from "rwsdk/worker";
import {
  listAnchorsService,
  type ServiceResult,
  type AnchorItem,
} from "@/lib/pods/podsService";

export async function listAnchors(podId: string): Promise<ServiceResult<AnchorItem[]>> {
  const ctx = requestInfo.ctx;
  if (!ctx.user)         return { ok: false, error: "unauthorized" };
  if (!ctx.organization) return { ok: false, error: "no active organization" };

  return listAnchorsService({
    organizationId: ctx.organization.id,
    podId,
  });
}