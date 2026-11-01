// src/app/api/qlave/createRoom.ts
//
// Identity model:
//   1. Look up the org once via userId → site → organizationId.
//   2. Store orgId in the room record.
//   3. Everything downstream (DO flush, diarize queue) reads orgId from the
//      room snapshot — no re-derivation from userId after this point.

import { generateCode, createRoom } from "@/lib/qlave/roomCode";
import {
  getTranscriptionPluginByUserId,
  getRecordingPluginByUserId,
  resolveDiarizationPlugin,
} from "@/lib/plugins/resolver";
import { db } from "@/db";
import type { RoomConfig } from "@/lib/qlave/roomCode";
import { normalizeTier } from "@/lib/tiers";
import { resolveCapabilities, type SessionUIOptions } from "@/lib/qlave/qlaveCapabilities";

export default async function ({ request, ctx }: { request: Request; ctx: any }) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  if (!ctx.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({})) as { config?: RoomConfig };

  // ── Single org lookup — userId is only used here ──────────────────────────
  // Everything downstream reads orgId from the room snapshot, never userId.
  const site = await db.site.findFirst({
    where:  { userId: ctx.user.id },
    select: { siteKey: true, organizationId: true },
  });
  const orgId   = site?.organizationId ?? null;
  const siteKey = site?.siteKey ?? null;

  // ── Plugin resolution — all keyed by orgId via the ByUserId helpers ───────
  const [transcription, recording] = await Promise.all([
    getTranscriptionPluginByUserId(db, ctx.user.id),
    getRecordingPluginByUserId(db, ctx.user.id),
  ]);

  // Diarization derives from transcription — no extra DB hit.
  const diarization = resolveDiarizationPlugin(transcription);

  // User-supplied config wins — fall back to plugin defaults.
  const config: RoomConfig = body.config ?? {
    maxPeers:              transcription?.enabled ? 12 : 4,
    transcription:         transcription?.enabled ?? false,
    storeTranscript:       (transcription?.enabled && recording?.enabled) ?? false,
    postSessionTranscribe: false,
    recording:             (recording?.enabled && !recording.atCap) ?? false,
    recordingResolution:   (recording?.resolution as "720p" | "1080p") ?? "720p",
    diarize:               false,
  };

  // Derive UI options from config so the capability resolver has clean input.
  const uiOptions: SessionUIOptions = {
    recordVideo:  config.recording,
    liveCaptions: config.transcription,
    diarize:      config.diarize ?? false,
  };

  // Resolve the full capability set server-side and snapshot it into the room.
  // Tier gates applied here — user can ask for diarize but if their tier
  // doesn't allow it, it lands as false and stays false for the whole session.
  const capabilities = resolveCapabilities(uiOptions, {
    transcription,
    recording,
    diarization,
  });

  const code      = generateCode();
  const sessionId = crypto.randomUUID();

  await createRoom(code, sessionId, ctx.user.id, orgId, siteKey, {
    transcription: transcription?.enabled
      ? {
          enabled: true,
          mode:    transcription.mode as "sample" | "trial" | "active",
          tier:    normalizeTier(transcription.tier),
        }
      : { enabled: false, mode: "sample", tier: "free" },

    recording: recording?.enabled && !recording.atCap
      ? { enabled: true as const, tier: config.recordingResolution }
      : undefined,

    diarization: diarization.enabled
      ? {
          enabled: true,
          mode:    diarization.mode as "sample" | "trial" | "active",
          tier:    normalizeTier(diarization.tier),
        }
      : undefined,

    capabilities,
    config,
  });

  const reqUrl = new URL(request.url);
  const origin = reqUrl.hostname.includes("localhost")
    ? `${reqUrl.protocol}//${reqUrl.host}`
    : `https://${reqUrl.hostname.split(".").slice(-2).join(".")}`;

  return Response.json({ code, url: `${origin}/s/${code}`, capabilities });
}