// src/lib/plugins/recording/forwardToRecordingDO.ts
// Shared helper — forward a recording action to RecordingCoordinatorDO.
// Fire and forget — never throws, never blocks.

import { env } from "cloudflare:workers";

export function forwardToRecordingDO(
  sessionId: string,
  action: string,
  body?: object
): void {
  try {
    const doId = (env as any).RECORDING_COORDINATOR_DO.idFromName(sessionId);
    const stub = (env as any).RECORDING_COORDINATOR_DO.get(doId);
    stub.fetch(`https://do-internal/?action=${action}`, {
      method: body ? "POST" : "GET",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    }).catch(() => {});
  } catch { /* recording not active for this session */ }
}