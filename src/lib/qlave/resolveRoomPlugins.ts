// src/lib/qlave/resolveRoomPlugins.ts
// Resolves plugin permissions for a room — usable from any server context.
// SessionPage, server actions, API routes, dashboard all use this.

import { getOrCreateSite } from "@/lib/qlave/siteService";
import { getTranscriptionPluginByUserId, getRecordingPluginByUserId } from "@/lib/plugins/resolver";
import { db } from "@/db";
import type { RoomRecord } from "@/lib/qlave/roomCode";
import type { RecordingTier } from "@/lib/plugins/recording/types";

export interface ResolvedRoomPlugins {
  orgId:            string;
  siteKey:          string | null;
  recordingEnabled: boolean;
  recordingTier:    RecordingTier;
  atCap:            boolean;
}

export async function resolveRoomPlugins(
  room: RoomRecord,
  userId?: string | null
): Promise<ResolvedRoomPlugins> {
  const ownerId = room.userId ?? userId ?? null;

  // Transcription — snapshot wins, fall back to live DB lookup for legacy rooms
  let transcriptionEnabled = room.plugins?.transcription?.enabled ?? null;
  if (transcriptionEnabled === null && ownerId) {
    const resolved = await getTranscriptionPluginByUserId(db, ownerId);
    transcriptionEnabled = resolved.enabled;
  }

  const siteKey = (transcriptionEnabled && ownerId)
    ? (await getOrCreateSite(ownerId)).siteKey
    : null;

  // Recording — always resolve live from DB so cap + config is always fresh
  const member = ownerId ? await db.member.findFirst({
    where: { userId: ownerId },
    select: { organizationId: true },
  }) : null;
  const orgId = member?.organizationId ?? "";
  
  let recordingEnabled = false;
  let recordingTier: RecordingTier = "720p";
  let atCap = false;

  if (ownerId) {
    const recording = await getRecordingPluginByUserId(db, ownerId);
    recordingEnabled = recording.enabled && !recording.atCap;
    recordingTier    = recording.resolution;
    atCap            = recording.atCap;
  }

  return { orgId, siteKey, recordingEnabled, recordingTier, atCap };
}