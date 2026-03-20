// src/app/api/qlave/createRoom.ts
import { generateCode, createRoom } from "@/lib/qlave/roomCode";
import { getTranscriptionPluginByUserId, getRecordingPluginByUserId } from "@/lib/plugins/resolver";
import { db } from "@/db";
import type { RoomConfig } from "@/lib/qlave/roomCode";

export default async function ({ request, ctx }: { request: Request; ctx: any }) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  if (!ctx.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({})) as { config?: RoomConfig };

  const [transcription, recording] = await Promise.all([
    getTranscriptionPluginByUserId(db, ctx.user.id),
    getRecordingPluginByUserId(db, ctx.user.id),
  ]);

  const site = await db.site.findFirst({ where: { userId: ctx.user.id } });

  // User-supplied config wins — fall back to plugin defaults
  const config: RoomConfig = body.config ?? {
    maxPeers:              transcription?.enabled ? 12 : 4,
    transcription:         transcription?.enabled ?? false,
    storeTranscript:       (transcription?.enabled && recording?.enabled) ?? false,
    postSessionTranscribe: false,
    recording:             (recording?.enabled && !recording.atCap) ?? false,
    recordingResolution:   (recording?.resolution as "720p" | "1080p") ?? "720p",
  };

  const code      = generateCode();
  const sessionId = crypto.randomUUID();

  await createRoom(code, sessionId, ctx.user.id, site?.siteKey ?? null, {
    transcription: transcription?.enabled
      ? {
          enabled: true,
          mode:    transcription.mode as "sample" | "trial" | "active",
          tier:    transcription.tier as "free" | "starter" | "pro" | "scale" | "creator" | "founder",
        }
      : { enabled: false, mode: "sample", tier: "free" },

    recording: recording?.enabled && !recording.atCap
      ? { enabled: true as const, tier: config.recordingResolution }
      : undefined,

    config,
  });

  const reqUrl = new URL(request.url);
  const origin = reqUrl.hostname.includes("localhost")
    ? `${reqUrl.protocol}//${reqUrl.host}`
    : `https://${reqUrl.hostname.split(".").slice(-2).join(".")}`;

  return Response.json({ code, url: `${origin}/s/${code}` });
}