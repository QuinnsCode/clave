// src/lib/plugins/recording/r2.ts
import type { RecordingTier } from "./types";
import { AwsClient } from "aws4fetch";

export const RECORDING_BUCKET = "qlave-recordings";

// ── Key helpers ───────────────────────────────────────────────────────────────

export function chunkKey(orgId: string, sessionId: string, peerId: string, chunkIndex: number, ext = "webm"): string {
  return `${orgId}/${sessionId}/${peerId}/chunks/${String(chunkIndex).padStart(6, "0")}.${ext}`;
}
export function peerManifestKey(orgId: string, sessionId: string, peerId: string): string {
  return `${orgId}/${sessionId}/${peerId}/manifest.json`;
}
export function sessionManifestKey(orgId: string, sessionId: string): string {
  return `${orgId}/${sessionId}/session.json`;
}
export function transcriptArchiveKey(orgId: string, sessionId: string): string {
  return `${orgId}/${sessionId}/transcript.json`;
}
export function assembledTrackKey(orgId: string, sessionId: string, peerId: string): string {
  return `${orgId}/${sessionId}/${peerId}/track.webm`;
}
export function chunkPrefix(orgId: string, sessionId: string, peerId: string): string {
  return `${orgId}/${sessionId}/${peerId}/chunks/`;
}

// ── MIME helpers ──────────────────────────────────────────────────────────────

const EXT_MAP: Record<string, string> = {
  "video/webm":                 "webm",
  "video/webm;codecs=vp8,opus": "webm",
  "video/webm;codecs=vp9,opus": "webm",
  "video/mp4":                  "mp4",
};
export const SUPPORTED_MIME_TYPES = Object.keys(EXT_MAP);
export function extForMime(mimeType: string): string {
  return EXT_MAP[mimeType] ?? "webm";
}

// ── Presign a chunk PUT ───────────────────────────────────────────────────────

export async function presignChunkUpload(
  env: Env,
  key: string,
  _mimeType: string
): Promise<{ uploadUrl: string; expiresAt: number }> {
  const accountId       = (env as any).R2_ACCOUNT_ID as string;
  const accessKeyId     = (env as any).R2_ACCESS_KEY_ID as string;
  const secretAccessKey = (env as any).R2_SECRET_ACCESS_KEY as string;

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error("[recording/r2] Missing R2 credentials in env");
  }

  const expiresIn = 300;
  const client    = new AwsClient({ accessKeyId, secretAccessKey });
  const endpoint  = new URL(`https://${accountId}.r2.cloudflarestorage.com/${RECORDING_BUCKET}/${key}`);

  const signed = await client.sign(endpoint, {
    method: "PUT",
    aws:    { signQuery: true },
  });

  return {
    uploadUrl: signed.url,
    expiresAt: Date.now() + expiresIn * 1000,
  };
}

// ── List chunk keys for assembly ──────────────────────────────────────────────

export async function listChunkKeys(
  env: Env,
  orgId: string,
  sessionId: string,
  peerId: string
): Promise<string[]> {
  const accountId       = (env as any).R2_ACCOUNT_ID as string;
  const accessKeyId     = (env as any).R2_ACCESS_KEY_ID as string;
  const secretAccessKey = (env as any).R2_SECRET_ACCESS_KEY as string;
  const prefix          = chunkPrefix(orgId, sessionId, peerId);
  const host            = `${accountId}.r2.cloudflarestorage.com`;
  const keys: string[]  = [];
  let continuationToken: string | undefined;

  const client = new AwsClient({ accessKeyId, secretAccessKey });

  do {
    const queryParams = new URLSearchParams({
      "list-type": "2",
      "prefix":    prefix,
      ...(continuationToken ? { "continuation-token": continuationToken } : {}),
    });

    const url = `https://${host}/${RECORDING_BUCKET}?${queryParams}`;
    const res  = await client.fetch(url);
    const text = await res.text();

    const matches = text.matchAll(/<Key>([^<]+)<\/Key>/g);
    for (const m of matches) keys.push(m[1]);

    continuationToken = text.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/)?.[1];
  } while (continuationToken);

  return keys.sort();
}

// ── List all chunks for a session across all peers ────────────────────────────

export async function listSessionChunks(
    env: Env,
    orgId: string,
    sessionId: string
  ): Promise<string[]> {
    const accountId       = (env as any).R2_ACCOUNT_ID as string;
    const accessKeyId     = (env as any).R2_ACCESS_KEY_ID as string;
    const secretAccessKey = (env as any).R2_SECRET_ACCESS_KEY as string;
    const prefix          = `${orgId}/${sessionId}/`;
    const host            = `${accountId}.r2.cloudflarestorage.com`;
    const keys: string[]  = [];
    let continuationToken: string | undefined;
  
    const client = new AwsClient({ accessKeyId, secretAccessKey });
  
    do {
      const queryParams = new URLSearchParams({
        "list-type": "2",
        "prefix":    prefix,
        ...(continuationToken ? { "continuation-token": continuationToken } : {}),
      });
  
      const url  = `https://${host}/${RECORDING_BUCKET}?${queryParams}`;
      const res  = await client.fetch(url);
      const text = await res.text();
  
      const matches = text.matchAll(/<Key>([^<]+)<\/Key>/g);
      for (const m of matches) {
        if (m[1].includes("/chunks/")) keys.push(m[1]);
      }
  
      continuationToken = text.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/)?.[1];
    } while (continuationToken);
  
    return keys.sort();
}

// ── Write JSON to R2 via native binding ──────────────────────────────────────

export async function putJson(env: Env, key: string, data: unknown): Promise<void> {
  const bucket = (env as any).RECORDING_BUCKET as R2Bucket;
  await bucket.put(key, JSON.stringify(data), {
    httpMetadata: { contentType: "application/json" },
  });
}

// ── Read JSON from R2 via native binding ──────────────────────────────────────

export async function getJson<T>(env: Env, key: string): Promise<T | null> {
  const bucket = (env as any).RECORDING_BUCKET as R2Bucket;
  const obj    = await bucket.get(key);
  if (!obj) return null;
  try { return await obj.json() as T; } catch { return null; }
}

// ── Tier label ────────────────────────────────────────────────────────────────

export function tierLabel(tier: RecordingTier): string {
  return tier === "1080p" ? "1080p HD" : "720p";
}