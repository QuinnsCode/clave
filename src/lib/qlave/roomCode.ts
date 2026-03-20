// src/lib/qlave/roomCode.ts
// Room code generation + KV storage.
// Stores owner's plugin permissions at room creation time —
// no DB lookup needed at join time, wizard-of-oz editable via D1.
// Cache busts naturally: new rooms always snapshot current OrgPlugin state.

import { env } from "cloudflare:workers";

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
}

export interface RoomPluginPermissions {
  transcription?: {
    enabled: boolean;
    mode:    "sample" | "trial" | "active";
    tier:    "free" | "starter" | "pro" | "scale" | "creator" | "founder";
  };
  recording?: { enabled: true; tier: "720p" | "1080p" };
  config?:    RoomConfig;
}

export interface RoomRecord {
  sessionId: string;
  userId:    string | null;
  siteKey:   string | null;  // ← add
  createdAt: number;
  plugins:   RoomPluginPermissions;
}

// ── KV helpers ────────────────────────────────────────────────────────────────

const kv = () => (env as any).RATELIMIT_KV;

/** Safely parse KV value — handles both raw string and already-parsed object */
function parseRoomRecord(raw: unknown): RoomRecord | null {
  if (!raw) return null;

  // Already parsed by KV "json" type hint
  if (typeof raw === "object") return raw as RoomRecord;

  // Raw string — parse it
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as RoomRecord;
    } catch {
      return null;
    }
  }

  return null;
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function createRoom(
  code: string,
  sessionId: string,
  userId: string | null,
  siteKey: string | null,        // ← add
  plugins: RoomPluginPermissions = {}
): Promise<void> {
  const record: RoomRecord = {
    sessionId,
    userId,
    siteKey,                     // ← add
    createdAt: Date.now(),
    plugins,
  };
  await kv().put(`room:${code}`, JSON.stringify(record), {
    expirationTtl: TTL_SECONDS,
  });
}

export async function resolveRoom(code: string): Promise<RoomRecord | null> {
  // Use "json" type to let KV deserialize — parseRoomRecord handles edge cases
  const raw = await kv().get(`room:${code}`, "json");
  return parseRoomRecord(raw);
}

/** Overwrite plugin permissions on a live room — wizard-of-oz helper */
export async function patchRoomPlugins(
  code: string,
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