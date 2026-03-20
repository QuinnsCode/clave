// src/app/api/recording/status.ts
// GET /api/recording/status?sessionId=
// Queries RecordingCoordinatorDO for current state.
// Used by RecordingPanel server component for SSR initial state.

import type { StatusResponse } from "@/lib/plugins/recording/types";
import { env } from "cloudflare:workers";

export default async function handler({ request }: { request: Request }): Promise<Response> {
  if (request.method !== "GET") {
    return Response.json({ ok: false, error: "Method not allowed" }, { status: 405 });
  }

  const url       = new URL(request.url);
  const sessionId = url.searchParams.get("sessionId");

  if (!sessionId) {
    return Response.json({ ok: false, error: "Missing sessionId" }, { status: 400 });
  }

  try {
    const doId = (env as any).RECORDING_COORDINATOR_DO.idFromName(sessionId);
    const stub = (env as any).RECORDING_COORDINATOR_DO.get(doId);

    const doUrl = new URL("https://do-internal/?action=status");
    const res = await stub.fetch(doUrl.toString());
    const status = await res.json() as StatusResponse;

    return Response.json(status);
  } catch {
    // DO not yet initialized — recording hasn't started for this session
    const empty: StatusResponse = {
      ok: true,
      enabled: false,
      tier: null,
      peers: {},
      assembled: false,
    };
    return Response.json(empty);
  }
}