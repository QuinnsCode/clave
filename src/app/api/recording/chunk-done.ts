// src/app/api/recording/chunk-done.ts
// POST /api/recording/chunk-done
// Client calls this after a successful R2 upload.
// Forwards to RecordingCoordinatorDO — fire and forget from client perspective.

import type { ChunkDoneRequest } from "@/lib/plugins/recording/types";
import { env } from "cloudflare:workers";

export default async function handler({ request }: { request: Request }): Promise<Response> {
  if (request.method !== "POST") {
    return Response.json({ ok: false, error: "Method not allowed" }, { status: 405 });
  }

  let body: ChunkDoneRequest & { sessionId: string; orgId: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const { sessionId, orgId, peerId, displayName, chunkIndex, r2Key } = body;

  if (!sessionId || !orgId || !peerId || chunkIndex === undefined) {
    return Response.json({ ok: false, error: "Missing required fields" }, { status: 400 });
  }

  // ── Forward to RecordingCoordinatorDO — non-blocking ─────────────────────
  try {
    const doId = (env as any).RECORDING_COORDINATOR_DO.idFromName(sessionId);
    const stub = (env as any).RECORDING_COORDINATOR_DO.get(doId);

    const doUrl = new URL("https://do-internal/?action=chunk-done");
    stub.fetch(doUrl.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ peerId, displayName, chunkIndex, r2Key }),
    }).catch((e: unknown) => {
      console.error("[chunk-done] DO write failed:", e);
    });
  } catch (e) {
    // Non-fatal — chunk is safely in R2, DO state is best-effort
    console.error("[chunk-done] DO lookup failed:", e);
  }

  return Response.json({ ok: true });
}