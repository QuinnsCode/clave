"use server";
// src/app/serverActions/pods/createAnchor.ts

import { requestInfo } from "rwsdk/worker";
import {
  createAnchorService,
  type ServiceResult,
  type AnchorItem,
} from "@/lib/pods/podsService";

export async function createAnchor(
  podId:     string,
  canonical: string,
): Promise<ServiceResult<AnchorItem>> {
  const ctx = requestInfo.ctx;
  if (!ctx.user)         return { ok: false, error: "unauthorized" };
  if (!ctx.organization) return { ok: false, error: "no active organization" };

  return createAnchorService({
    organizationId: ctx.organization.id,
    podId,
    canonical,
  });
}