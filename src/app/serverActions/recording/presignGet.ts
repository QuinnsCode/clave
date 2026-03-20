"use server";

// @/app/serverActions/recording/presignGet.ts

import { env } from "cloudflare:workers";
import { presignGet as _presignGet } from "@/lib/plugins/recording/presignGet";

export async function presignGet(r2Key: string): Promise<string> {
  return _presignGet(env as any, r2Key);
}