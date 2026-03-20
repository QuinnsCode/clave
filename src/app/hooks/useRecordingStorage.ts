"use client";
// src/app/hooks/useRecordingStorage.ts
// Recording storage plugin — implements SessionPlugin interface.
// Gets stream + ws via onJoin, cleans up via onLeave.
// Presigns per chunk, uploads direct to R2 (client pays bandwidth),
// notifies server via chunk-done after each successful upload.
//
// Usage:
//   const recording = useRecordingStorage({ sessionId, roomCode, orgId, tier, enabled, displayName });
//   <SessionClient plugins={[transcription, recording.plugin]} ... />

import { useRef, useState, useCallback } from "react";
import type { SessionPlugin } from "@/types";
import type { RecordingTier, RecordingState, PresignResponse } from "@/lib/plugins/recording/types";

// ── Config ────────────────────────────────────────────────────────────────────

const CHUNK_DURATION_MS = 2500;     // aligned with audio transcription chunks
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1000;

const MIME_PRIORITY = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
];

function getSupportedMime(): string | null {
  for (const mime of MIME_PRIORITY) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface UseRecordingStorageOptions {
  sessionId:   string;
  roomCode:    string;
  orgId:       string;
  tier:        RecordingTier;
  enabled:     boolean;
  displayName: string;              // user display name for chunk metadata
}

export interface UseRecordingStorageReturn {
  state:        RecordingState;
  chunkCount:   number;
  errorMessage: string | null;
  plugin:       SessionPlugin;      // pass this into SessionClient plugins array
}

interface PendingChunk {
  blob:       Blob;
  chunkIndex: number;
  mimeType:   string;
  timestamp:  number;
  attempts:   number;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useRecordingStorage({
  sessionId,
  roomCode,
  orgId,
  tier,
  enabled,
  displayName,
}: UseRecordingStorageOptions): UseRecordingStorageReturn {

  const [state, setState]               = useState<RecordingState>("idle");
  const [chunkCount, setChunkCount]     = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const recorderRef    = useRef<MediaRecorder | null>(null);
  const peerIdRef      = useRef<string>("");
  const chunkIndexRef  = useRef(0);
  const uploadQueueRef = useRef<PendingChunk[]>([]);
  const uploadingRef   = useRef(false);
  const stoppedRef     = useRef(false);

  // ── Upload queue ──────────────────────────────────────────────────────────

  const processQueue = useCallback(async () => {
    if (uploadingRef.current || uploadQueueRef.current.length === 0) return;
    uploadingRef.current = true;

    while (uploadQueueRef.current.length > 0) {
      const chunk = uploadQueueRef.current[0];
      const success = await uploadChunk(chunk);

      if (success) {
        uploadQueueRef.current.shift();
        setChunkCount(c => c + 1);
      } else if (chunk.attempts >= MAX_RETRY_ATTEMPTS) {
        console.warn(`[useRecordingStorage] dropping chunk ${chunk.chunkIndex} after ${MAX_RETRY_ATTEMPTS} attempts`);
        uploadQueueRef.current.shift();
      } else {
        await sleep(RETRY_DELAY_MS * chunk.attempts);
      }
    }

    uploadingRef.current = false;
    if (stoppedRef.current) setState("stopped");
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function uploadChunk(chunk: PendingChunk): Promise<boolean> {
    chunk.attempts++;
    try {
      // 1. Get presigned R2 PUT URL
      const presignUrl = new URL("/api/recording/presign", location.origin);
      presignUrl.searchParams.set("sessionId",  sessionId);
      presignUrl.searchParams.set("roomCode",   roomCode);
      presignUrl.searchParams.set("peerId",     peerIdRef.current);
      presignUrl.searchParams.set("chunkIndex", String(chunk.chunkIndex));
      presignUrl.searchParams.set("mimeType",   chunk.mimeType);

      const presignRes = await fetch(presignUrl.toString());
      if (!presignRes.ok) {
        console.error(`[useRecordingStorage] presign failed: ${presignRes.status}`);
        return false;
      }
      const { uploadUrl, r2Key } = await presignRes.json() as PresignResponse;

      // 2. PUT direct to R2 — client pays bandwidth, server never sees bytes
      const putRes = await fetch(uploadUrl, {
        method:  "PUT",
        body:    chunk.blob,
        headers: { "Content-Type": chunk.mimeType },
      });
      if (!putRes.ok) {
        console.error(`[useRecordingStorage] R2 PUT failed: ${putRes.status}`);
        return false;
      }

      // 3. Notify DO — fire and forget, DO updates chunk manifest
      fetch("/api/recording/chunk-done", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          orgId,
          peerId:      peerIdRef.current,
          displayName,
          chunkIndex:  chunk.chunkIndex,
          r2Key,
          timestamp:   chunk.timestamp,
          durationMs:  CHUNK_DURATION_MS,
          mimeType:    chunk.mimeType,
          sizeBytes:   chunk.blob.size,
        }),
      }).catch(() => {});

      return true;
    } catch (e) {
      console.error("[useRecordingStorage] upload error:", e);
      return false;
    }
  }

  // ── MediaRecorder ─────────────────────────────────────────────────────────

  function startRecorder(stream: MediaStream): void {
    const mimeType = getSupportedMime();
    if (!mimeType) {
      setErrorMessage("Recording not supported in this browser");
      setState("error");
      return;
    }
  
    try {
      // Audio-only stream — survives tab switches, no video overhead
      const audioCtx    = new AudioContext();
      const source      = audioCtx.createMediaStreamSource(stream);
      const dest        = audioCtx.createMediaStreamDestination();
      source.connect(dest);
  
      const audioStream = dest.stream;
      const recorder    = new MediaRecorder(audioStream, { mimeType });
  
      recorderRef.current    = recorder;
      stoppedRef.current     = false;
      chunkIndexRef.current  = 0;
      uploadQueueRef.current = [];
  
      recorder.ondataavailable = (e) => {
        if (e.data.size === 0) return;
        uploadQueueRef.current.push({
          blob:       e.data,
          chunkIndex: chunkIndexRef.current++,
          mimeType,
          timestamp:  Date.now(),
          attempts:   0,
        });
        setState("uploading");
        processQueue();
      };
  
      recorder.onerror = () => {
        setErrorMessage("Recording error — some chunks may be missing");
        setState("error");
      };
  
      recorder.start(CHUNK_DURATION_MS);
      setState("recording");
      setErrorMessage(null);
    } catch (e) {
      console.error("[useRecordingStorage] MediaRecorder start failed:", e);
      setErrorMessage("Failed to start recording");
      setState("error");
    }
  }

  // ── Plugin lifecycle ──────────────────────────────────────────────────────

  const onJoin = useCallback((_ws: WebSocket, peerId: string, stream: MediaStream) => {
    if (!enabled) return;
    peerIdRef.current = peerId;
    startRecorder(stream);
  }, [enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  const onLeave = useCallback(() => {
    stoppedRef.current = true;
    try { recorderRef.current?.stop(); } catch { /* already stopped */ }
    recorderRef.current = null;
    if (uploadQueueRef.current.length === 0 && !uploadingRef.current) {
      setState("stopped");
    }
  }, []);

  // ── Return ────────────────────────────────────────────────────────────────
  // renderControls lives in RecordingIndicator.tsx — hook stays pure .ts
  // Wire it: const plugin = { ...recording.plugin, renderControls: () => <RecordingIndicator recording={recording} /> }

  const plugin: SessionPlugin = { onJoin, onLeave };

  return { state, chunkCount, errorMessage, plugin };
}