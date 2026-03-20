// @/app/serverActions/recording/getSessionRecording.ts
"use server";

import { env } from "cloudflare:workers";
import { getSessionRecording as _getSessionRecording } from "@/lib/plugins/recording/getSessionRecording";
import type { SessionRecording } from "@/lib/plugins/recording/getSessionRecording";

export async function getSessionRecording(
    sessionId: string,
    userId: string,
    orgId: string
  ): Promise<SessionRecording | null> {
    return _getSessionRecording(env as any, sessionId, userId, orgId);
  }

export type { SessionRecording };