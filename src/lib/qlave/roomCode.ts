// src/lib/qlave/roomCode.ts
// Room code generation + KV storage.
// Stores owner's plugin permissions at room creation time —
// no DB lookup needed at join time, wizard-of-oz editable via D1.
// Cache busts naturally: new rooms always snapshot current OrgPlugin state.
//
// Identity model:
//   userId  — the room creator. Used only to look up orgId at creation time.
//   orgId   — the org whose permissions govern this room. Stored in the record.
//   siteKey — the transcription billing key tied to the org.
// At session end, the DO reads orgId + siteKey from the room snapshot.
// Nothing re-derives from userId after creation.

import { env } from "cloudflare:workers";
import type { TierKey } from "@/lib/tiers";

// Inlined to keep client bundle from pulling resolver → tiers → cloudflare:workers
// when CreateRoomModal imports RoomConfig from this file.
// Source of truth: @/lib/qlave/qlaveCapabilities — keep in sync.
interface SessionCapabilities {
  capture: {
    videoRecorder:  boolean;
    audioRecorder:  boolean;
    liveTranscribe: boolean;
  };
  postProcess: {
    diarize: boolean;
  };
  vocabulary: {
    enabled: false;
    learn:   false;
  };
}

const CHARS = "abcdefghijkmnpqrstuvwxyz23456789"; // no ambiguous chars (0/o, 1/l)
const TTL_SECONDS = 60 * 60 * 24; // 24hr

function randomChars(n: number): string {
  return Array.from({ length: n }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join("");
}

export function generateCode(): string {
  return `${randomChars(3)}-${randomChars(7)}`;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RoomConfig {
  maxPeers:              number;
  transcription:         boolean;
  storeTranscript:       boolean;
  postSessionTranscribe: boolean;
  recording:             boolean;
  recordingResolution:   "720p" | "1080p";
  // Optional — old clients that don't send this get diarize=false by default.
  diarize?:              boolean;
}

export interface RoomPluginPermissions {
  transcription?: {
    enabled: boolean;
    mode:    "sample" | "trial" | "active";
    tier:    TierKey;
  };
  recording?: { enabled: true; tier: "720p" | "1080p" };

  // Optional — old rooms don't have this; readers default to disabled.
  diarization?: {
    enabled: boolean;
    mode:    "sample" | "trial" | "active";
    tier:    TierKey;
  };

  // Full resolved capability snapshot. Hooks and post-process consumers read
  // from here. If absent (legacy room), use deriveCapabilitiesFromLegacyRoom().
  capabilities?: SessionCapabilities;

  config?: RoomConfig;
}

export interface RoomRecord {
  sessionId: string;
  userId:    string | null;
  orgId:     string | null;  // org that owns this room — source of truth for billing/diarize
  siteKey:   string | null;  // transcription billing key
  createdAt: number;
  plugins:   RoomPluginPermissions;
}

// ── KV helpers ────────────────────────────────────────────────────────────────

const kv = () => (env as any).RATELIMIT_KV;

/** Safely parse KV value — handles both raw string and already-parsed object */
function parseRoomRecord(raw: unknown): RoomRecord | null {
  if (!raw) return null;
  if (typeof raw === "object") return raw as RoomRecord;
  if (typeof raw === "string") {
    try { return JSON.parse(raw) as RoomRecord; } catch { return null; }
  }
  return null;
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function createRoom(
  code:      string,
  sessionId: string,
  userId:    string | null,
  orgId:     string | null,   // org that owns the room
  siteKey:   string | null,   // transcription billing key
  plugins:   RoomPluginPermissions = {}
): Promise<void> {
  const record: RoomRecord = {
    sessionId,
    userId,
    orgId,
    siteKey,
    createdAt: Date.now(),
    plugins,
  };
  await kv().put(`room:${code}`, JSON.stringify(record), {
    expirationTtl: TTL_SECONDS,
  });
}

export async function resolveRoom(code: string): Promise<RoomRecord | null> {
  const raw = await kv().get(`room:${code}`, "json");
  return parseRoomRecord(raw);
}

/** Overwrite plugin permissions on a live room — wizard-of-oz helper */
export async function patchRoomPlugins(
  code:    string,
  plugins: RoomPluginPermissions
): Promise<boolean> {
  const existing = await resolveRoom(code);
  if (!existing) return false;
  const updated: RoomRecord = { ...existing, plugins };
  await kv().put(`room:${code}`, JSON.stringify(updated), {
    expirationTtl: TTL_SECONDS,
  });
  return true;
}