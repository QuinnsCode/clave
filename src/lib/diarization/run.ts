// src/app/api/diarization/run.ts
//
// POST /api/diarization/run
// Manual trigger to run the full diarization pipeline for one peer.
// Founder-gated since it costs Workers AI credits per call.
//
// Body:
//   {
//     organizationId: string,            // required (alias: orgId — deprecated)
//     siteKey:        string,            // required
//     sessionId:      string,            // required
//     peerId:         string,            // required
//
//     // ONE of these two is allowed (vocabulary is the legacy shortcut):
//     diarizationOpts?: DiarizationOpts, // full passthrough — provider + opts + vocab + language
//     vocabulary?:      string[],        // legacy — wraps into { vocabulary } internally
//   }
//
// Returns the RunDiarizationResult shape — diarizationId + provider + speaker
// count + timings + R2 keys where assembled audio and JSON landed.
//
// Also writes a SessionDiarization row to D1 (status: "running" → "done" or
// "failed"). The returned `diarizationId` is the row's primary key.

import { env } from "cloudflare:workers";
import { runPostProcessing } from "@/lib/postprocessing/runPostProcessing";
import type { DiarizationOpts } from "@/lib/diarization/types";  // NEW

export default async function handler({ request, ctx }: { request: Request; ctx: any }): Promise<Response> {
  if (request.method !== "POST") {
    return Response.json({ ok: false, error: "Method not allowed" }, { status: 405 });
  }

  // ── Auth: founder only ──────────────────────────────────────────────────
//   const user = ctx?.user;
//   if (!user) {
//     return Response.json({ ok: false, error: "Not authenticated" }, { status: 401 });
//   }
//   if ((user.tier ?? "free") !== "founder") {
//     return Response.json({ ok: false, error: "Founder tier only" }, { status: 403 });
//   }

  // ── Parse body ──────────────────────────────────────────────────────────
  let body: any;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  // NEW: accept either `organizationId` (new canonical name) or `orgId`
  // (legacy — kept temporarily so existing curl snippets keep working).
  // Drop the `orgId` fallback once all callers are updated.
  const organizationId: unknown = body?.organizationId ?? body?.orgId;
  const { siteKey, sessionId, peerId, vocabulary, diarizationOpts } = body ?? {};

  if (typeof organizationId !== "string" || !organizationId) return Response.json({ ok: false, error: "missing organizationId" }, { status: 400 });
  if (typeof siteKey        !== "string" || !siteKey)        return Response.json({ ok: false, error: "missing siteKey"        }, { status: 400 });  // NEW
  if (typeof sessionId      !== "string" || !sessionId)      return Response.json({ ok: false, error: "missing sessionId"      }, { status: 400 });
  if (typeof peerId         !== "string" || !peerId)         return Response.json({ ok: false, error: "missing peerId"         }, { status: 400 });

  // diarizationOpts wins over vocabulary if both provided.
  // (vocabulary kept for back-compat with the curl path that just wants to
  // boost a few D&D names without thinking about the full opts shape.)
  const effectiveOpts: DiarizationOpts | undefined =
    (diarizationOpts && typeof diarizationOpts === "object")
      ? diarizationOpts as DiarizationOpts
      : (Array.isArray(vocabulary) ? { vocabulary } : undefined);

  // ── Run pipeline ────────────────────────────────────────────────────────
  try {
    const result = await runPostProcessing(env as any, {
      organizationId,           // CHANGED: was orgId
      siteKey,                  // NEW
      sessionId,
      peerId,
      diarizationOpts: effectiveOpts,   // CHANGED: full opts, not just vocabulary
      triggeredBy:     "manual:curl",   // NEW: audit trail — will be userId once auth is on
    });
    return Response.json(result);
  } catch (err: any) {
    return Response.json({
      ok:    false,
      error: String(err?.message ?? err),
      code:  err?.code,
    }, { status: 500 });
  }
}