// src/lib/plugins/recording/types.ts
// Shared types across the recording plugin — DO, queue, API, client.

export type RecordingTier = "720p" | "1080p";

export type RecordingState =
  | "idle"
  | "recording"
  | "uploading"   // chunk in flight
  | "error"
  | "stopped";

// ── Chunk metadata ────────────────────────────────────────────────────────────

export interface ChunkMeta {
  chunkIndex: number;
  peerId: string;
  r2Key: string;
  timestamp: number;      // client wall clock when chunk was created
  durationMs: number;     // actual chunk duration (~2500ms)
  mimeType: string;
  sizeBytes: number;
}

// ── Per-peer manifest ─────────────────────────────────────────────────────────

export interface PeerManifest {
  peerId: string;
  displayName: string;
  chunks: ChunkMeta[];
  startedAt: number;
  lastChunkAt: number;
  assembled: boolean;
  assembledKey?: string;  // R2 key of assembled file once done
}

// ── Session manifest — written to R2 on finalization ─────────────────────────

export interface SessionManifest {
  sessionId: string;
  orgId: string;
  siteKey: string;
  tier: RecordingTier;
  startedAt: number;
  endedAt: number;
  peers: PeerManifest[];
  transcriptKey?: string;
}

// ── DO internal state ─────────────────────────────────────────────────────────

export interface RecordingCoordinatorState {
  sessionId: string;
  orgId: string;
  siteKey: string;
  tier: RecordingTier;
  startedAt: number;
  flushed: boolean;
  peers: Record<string, {
    displayName: string;
    chunkCount: number;
    lastChunkAt: number;
    assembled: boolean;
  }>;
}

// ── Queue messages ────────────────────────────────────────────────────────────

export type RecordingQueueMessage =
  | { type: "session-ended";       sessionId: string; orgId: string; siteKey: string }
  | { type: "assemble-peer-track"; sessionId: string; orgId: string; peerId: string; siteKey: string }
  | { type: "finalize-manifest";   sessionId: string; orgId: string; siteKey: string };

// ── API shapes ────────────────────────────────────────────────────────────────

export interface PresignResponse {
  ok: true;
  uploadUrl: string;
  r2Key: string;
  expiresAt: number;
}

export interface ChunkDoneRequest {
  peerId: string;
  displayName: string;
  chunkIndex: number;
  r2Key: string;
  timestamp: number;
  durationMs: number;
  mimeType: string;
  sizeBytes: number;
}

export interface StatusResponse {
  ok: true;
  enabled: boolean;
  tier: RecordingTier | null;
  peers: Record<string, {
    chunkCount: number;
    lastChunkAt: number;
    assembled: boolean;
  }>;
  assembled: boolean;
}