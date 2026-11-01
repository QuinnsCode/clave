"use server";
// src/app/serverActions/pods/deleteAnchor.ts

import { requestInfo } from "rwsdk/worker";
import {
  deleteAnchorService,
  type ServiceResult,
} from "@/lib/pods/podsService";

export async function deleteAnchor(anchorId: string): Promise<ServiceResult<{ podId: string }>> {
  const ctx = requestInfo.ctx;
  if (!ctx.user)         return { ok: false, error: "unauthorized" };
  if (!ctx.organization) return { ok: false, error: "no active organization" };

  return deleteAnchorService({
    organizationId: ctx.organization.id,
    anchorId,
  });
}