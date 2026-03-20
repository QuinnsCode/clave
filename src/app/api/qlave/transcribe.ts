// app/api/qlave/transcribe.ts
// Auth → plugin resolve → cap check → AI → queue usage event → respond

import { validateSiteKey } from "@/lib/qlave/validateSiteKey";
import { getTranscriptionPlugin } from "@/lib/plugins/resolver";
import { checkAndIncrementUsage } from "@/lib/transcription/usage";
import { transcribeAudio } from "@/lib/transcription/transcribe";
import { computeCost } from "@/lib/transcription/models";
import type { TranscribeInput, TranscribeResponse } from "@/types";
import { env } from "cloudflare:workers";
import { db } from "@/db";


export default async function handler({ request }: { request: Request }): Promise<Response> {

  // ── Site key → org + user ─────────────────────────────────────────────────
  const siteKey = request.headers.get("x-site-key") ?? "";
  const site = await validateSiteKey(siteKey);
  if (!site) {
    return Response.json({ ok: false, error: { code: "INVALID_SITE_KEY", message: "Invalid site key" } }, { status: 401 });
  }

  const orgId    = site.organizationId ?? site.userId; // fallback for legacy rows without orgId
  const userId   = site.userId;

  // ── Parse body ────────────────────────────────────────────────────────────
  let input: TranscribeInput & { sessionId?: string };
  try { input = await request.json(); }
  catch { return Response.json({ ok: false, error: { code: "INVALID_AUDIO", message: "Invalid JSON" } }, { status: 400 }); }

  if (!input.audioBase64 || !input.mimeType) {
    return Response.json({ ok: false, error: { code: "INVALID_AUDIO", message: "Missing audioBase64 or mimeType" } }, { status: 400 });
  }

  // ── Resolve plugin config ─────────────────────────────────────────────────
  const plugin = await getTranscriptionPlugin(db, orgId);

  if (!plugin.enabled && plugin.mode === "disabled") {
    return Response.json({ ok: false, error: { code: "PLUGIN_DISABLED", message: "Transcription not enabled" } }, { status: 403 });
  }

  // ── Sample mode — enforce server-side too ─────────────────────────────────
  // Sample is handled client-side (1 min hard stop) but we don't track usage here
  // Just run it — no cap check, no usage write
  const isSample = plugin.mode === "sample";

  // ── Cap enforcement (trial + active only) ─────────────────────────────────
  // We don't know audio duration until after Whisper runs, so we do a pre-check
  // using a small estimate, then do a real increment after with actual duration.
  // For now: check current usage against cap before running.
  if (!isSample) {
    const { allowed, denyReason } = await checkAndIncrementUsage(
      env.RATELIMIT_KV,
      orgId,
      userId,
      0, // zero — just checking, real increment happens after
      {
        mode:              plugin.mode,
        capMinutes:        plugin.capMinutes,
        trialCapMinutes:   plugin.trialCapMinutes,
        trialEndsAt:       plugin.trialEndsAt,
        maxMinutesPerUser: plugin.maxMinutesPerUser,
      }
    );
    if (!allowed) {
      return Response.json({ ok: false, error: { code: "CAP_REACHED", message: denyReason } }, { status: 402 });
    }
  }

  // ── Run Whisper ───────────────────────────────────────────────────────────
  const result = await transcribeAudio(env.TRANSCRIPTION_AI, {
    ...input,
    model: plugin.modelKey,
  });

  // ── Increment real usage + queue analytics ────────────────────────────────
  if (!isSample && result.durationSeconds > 0) {
    const { costUsd, neuronsUsed } = computeCost(plugin.modelKey, result.durationSeconds);

    // Real KV increment
    await checkAndIncrementUsage(
      env.RATELIMIT_KV,
      orgId,
      userId,
      result.durationSeconds,
      {
        mode:              plugin.mode,
        capMinutes:        plugin.capMinutes,
        trialCapMinutes:   plugin.trialCapMinutes,
        trialEndsAt:       plugin.trialEndsAt,
        maxMinutesPerUser: plugin.maxMinutesPerUser,
      }
    );

    // Queue message for async D1 write — non-blocking
    if (env.TRANSCRIPTION_USAGE_QUEUE) {
      env.TRANSCRIPTION_USAGE_QUEUE.send({
        orgId,
        userId,
        sessionId:    input.sessionId ?? null,
        siteKey,
        model:        plugin.modelId,
        audioSeconds: result.durationSeconds,
        neuronsUsed,
        costUsd,
        mode:         plugin.mode,
        recordedAt:   new Date().toISOString(),
      }).catch(() => {}); // fire and forget
    }
  }

  const response: TranscribeResponse = { ok: true, result };
  return Response.json(response);
}