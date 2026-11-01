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
//
// NEW: optional audioEnabled flag spins up a second MediaRecorder that records
// just the audio track in parallel with the full A/V recorder. Audio chunks
// flow through the same /api/recording/presign + /chunk-done endpoints but
// with kind=audio so they land under /audio/ in R2 instead of /chunks/. The
// diarization container consumes these audio chunks after the session ends.
// All audio-only state is parallel to video state — separate queue, separate
// chunk index, separate retry/upload machinery — so each can fail independently.
//
// Source switching:
//   switchStream(newStream) — swaps the video recorder to a new stream
//   (e.g. screen share) without interrupting the audio recorder.
//   Audio track from the original camera stream is always preserved regardless
//   of which video source is active. Call it when the user toggles between
//   camera and screen share in SessionClient.

import { useRef, useState, useCallback } from "react";
import type { SessionPlugin } from "@/types";
import type { RecordingTier, RecordingState, PresignResponse } from "@/lib/plugins/recording/types";

// ── Config ────────────────────────────────────────────────────────────────────

const CHUNK_DURATION_MS = 2500;     // aligned with audio transcription chunks
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1000;

const MIME_PRIORITY = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
  "video/mp4",
];

// NEW: audio-only MIME priority list. Opus in WebM is the diarization sweet
// spot — small (~32 kbps), high quality for speech, supported everywhere
// Chromium ships, and nova-3 ingests it directly. Falls back to bare webm
// then mp4 for Safari.
const AUDIO_MIME_PRIORITY = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
];

function getSupportedMime(): string | null {
  for (const mime of MIME_PRIORITY) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return null;
}

// NEW: parallel helper for audio MIMEs. Same shape as getSupportedMime so the
// two recorders pick their format independently.
function getSupportedAudioMime(): string | null {
  for (const mime of AUDIO_MIME_PRIORITY) {
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
  // NEW: when true, spins up a second MediaRecorder for audio-only chunks
  // that the post-session diarization container consumes. Independent of
  // `enabled` — caller can have audio without video or video without audio,
  // though in practice the capability resolver bundles them.
  audioEnabled?: boolean;
}

export interface UseRecordingStorageReturn {
  state:        RecordingState;
  chunkCount:   number;
  errorMessage: string | null;
  plugin:       SessionPlugin;      // pass this into SessionClient plugins array
  // NEW: surface audio chunk count separately so RecordingIndicator can show
  // both progress bars. Errors continue to flow through the shared errorMessage.
  audioChunkCount: number;
  // NEW: swap the video recorder to a new stream (camera ↔ screen share).
  // Audio recorder is unaffected — mic keeps recording through source switches.
  switchStream: (newStream: MediaStream) => void;
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
  audioEnabled = false,
}: UseRecordingStorageOptions): UseRecordingStorageReturn {

  const [state, setState]               = useState<RecordingState>("idle");
  const [chunkCount, setChunkCount]     = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // NEW: audio chunk counter, parallel to video chunkCount above.
  const [audioChunkCount, setAudioChunkCount] = useState(0);

  const recorderRef    = useRef<MediaRecorder | null>(null);
  const peerIdRef      = useRef<string>("");
  const chunkIndexRef  = useRef(0);
  const uploadQueueRef = useRef<PendingChunk[]>([]);
  const uploadingRef   = useRef(false);
  const stoppedRef     = useRef(false);

  // NEW: parallel set of refs for the audio-only recorder. Same shape as the
  // video refs above — separate state so audio and video can fail/retry
  // independently without one taking the other down.
  const audioRecorderRef    = useRef<MediaRecorder | null>(null);
  const audioChunkIndexRef  = useRef(0);
  const audioUploadQueueRef = useRef<PendingChunk[]>([]);
  const audioUploadingRef   = useRef(false);

  // NEW: original camera stream — kept so we can extract the audio track when
  // switching to screen share (screen capture has no mic by default).
  const originalStreamRef = useRef<MediaStream | null>(null);

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

  // ── Audio upload queue ────────────────────────────────────────────────────
  // NEW. Parallel structure to processQueue/uploadChunk above. Two reasons it's
  // a copy rather than a shared helper:
  //   1. Each recorder needs its own in-flight gate (uploadingRef) so video
  //      retries don't block audio retries and vice versa.
  //   2. The presign call carries kind=audio so the server routes to
  //      audioChunkKey(...) instead of chunkKey(...). Sharing would mean
  //      threading the "kind" through everything.
  // The duplication is intentional and easy to read.

  const processAudioQueue = useCallback(async () => {
    if (audioUploadingRef.current || audioUploadQueueRef.current.length === 0) return;
    audioUploadingRef.current = true;

    while (audioUploadQueueRef.current.length > 0) {
      const chunk = audioUploadQueueRef.current[0];
      const success = await uploadAudioChunk(chunk);

      if (success) {
        audioUploadQueueRef.current.shift();
        setAudioChunkCount(c => c + 1);
      } else if (chunk.attempts >= MAX_RETRY_ATTEMPTS) {
        console.warn(`[useRecordingStorage] dropping audio chunk ${chunk.chunkIndex} after ${MAX_RETRY_ATTEMPTS} attempts`);
        audioUploadQueueRef.current.shift();
      } else {
        await sleep(RETRY_DELAY_MS * chunk.attempts);
      }
    }

    audioUploadingRef.current = false;
    // Note: we don't flip setState("stopped") from here. Video drives the
    // public state — audio is a parallel data path, not the user-visible one.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function uploadAudioChunk(chunk: PendingChunk): Promise<boolean> {
    chunk.attempts++;
    try {
      // 1. Presign with kind=audio so the server routes to /audio/ prefix
      const presignUrl = new URL("/api/recording/presign", location.origin);
      presignUrl.searchParams.set("sessionId",  sessionId);
      presignUrl.searchParams.set("roomCode",   roomCode);
      presignUrl.searchParams.set("peerId",     peerIdRef.current);
      presignUrl.searchParams.set("chunkIndex", String(chunk.chunkIndex));
      presignUrl.searchParams.set("mimeType",   chunk.mimeType);
      presignUrl.searchParams.set("kind",       "audio");

      const presignRes = await fetch(presignUrl.toString());
      if (!presignRes.ok) {
        console.error(`[useRecordingStorage] audio presign failed: ${presignRes.status}`);
        return false;
      }
      const { uploadUrl, r2Key } = await presignRes.json() as PresignResponse;

      // 2. PUT direct to R2 — same as video path
      const putRes = await fetch(uploadUrl, {
        method:  "PUT",
        body:    chunk.blob,
        headers: { "Content-Type": chunk.mimeType },
      });
      if (!putRes.ok) {
        console.error(`[useRecordingStorage] audio R2 PUT failed: ${putRes.status}`);
        return false;
      }

      // 3. Notify DO with kind=audio so it bumps audioChunkCount, not chunkCount
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
          kind:        "audio",
        }),
      }).catch(() => {});

      return true;
    } catch (e) {
      console.error("[useRecordingStorage] audio upload error:", e);
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
      const recorder = new MediaRecorder(stream, { mimeType });
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

  // ── Switch video stream (camera ↔ screen) ─────────────────────────────────
  // NEW. Stops the current video recorder and starts a new one on the new
  // stream. Audio recorder is untouched — mic keeps recording through source
  // switches. The new stream's audio tracks are ignored; we only care about
  // its video. Recorded video segments will have a seam at the switch point,
  // which is fine — the assembly step stitches chunks in order by chunkIndex.

  const switchStream = useCallback((newStream: MediaStream) => {
    if (!enabled) return;

    // Stop current video recorder — flushes its last chunk
    try { recorderRef.current?.stop(); } catch { /* already stopped */ }
    recorderRef.current = null;

    // Build a composed stream: video from newStream + audio from the original
    // camera stream. Screen capture doesn't include mic audio, so we always
    // take audio from the original stream regardless of video source.
    const videoTrack = newStream.getVideoTracks()[0];
    const audioTrack = originalStreamRef.current?.getAudioTracks()[0];

    const composedStream = new MediaStream([
      ...(videoTrack ? [videoTrack] : []),
      ...(audioTrack ? [audioTrack] : []),
    ]);

    startRecorder(composedStream);
  }, [enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Audio MediaRecorder ───────────────────────────────────────────────────
  // NEW. Parallel recorder for audio-only. We construct a new MediaStream
  // containing just the source's audio track and hand it to a second
  // MediaRecorder. This way the audio chunks are raw Opus with no video
  // container overhead — ideal input for nova-3 diarization later.

  function startAudioRecorder(stream: MediaStream): void {
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      console.warn("[useRecordingStorage] audio recording requested but stream has no audio track");
      return;
    }

    const mimeType = getSupportedAudioMime();
    if (!mimeType) {
      // Non-fatal — video can still record. Just log and skip the audio path.
      console.warn("[useRecordingStorage] no supported audio MIME type — diarization will be unavailable");
      return;
    }

    try {
      // Build a stream containing only the audio track. We don't mutate the
      // input stream — the WebRTC + video recorder need it intact.
      const audioStream = new MediaStream([audioTracks[0]]);
      const recorder    = new MediaRecorder(audioStream, { mimeType });
      audioRecorderRef.current    = recorder;
      audioChunkIndexRef.current  = 0;
      audioUploadQueueRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size === 0) return;
        audioUploadQueueRef.current.push({
          blob:       e.data,
          chunkIndex: audioChunkIndexRef.current++,
          mimeType,
          timestamp:  Date.now(),
          attempts:   0,
        });
        processAudioQueue();
      };

      recorder.onerror = () => {
        // Audio failures are logged but don't surface as a user-visible error —
        // the user-visible recording state is driven by video. Diarization
        // will simply be unavailable if audio recording dies mid-session.
        console.error("[useRecordingStorage] audio recorder error — diarization may be incomplete");
      };

      recorder.start(CHUNK_DURATION_MS);
    } catch (e) {
      console.error("[useRecordingStorage] audio MediaRecorder start failed:", e);
    }
  }

  // ── Plugin lifecycle ──────────────────────────────────────────────────────

  const onJoin = useCallback((_ws: WebSocket, peerId: string, stream: MediaStream) => {
    if (!enabled && !audioEnabled) return;
    peerIdRef.current     = peerId;
    originalStreamRef.current = stream; // preserve for audio track during screen switch
    // CHANGED: start each recorder based on its own flag. Either, both, or
    // neither may be on. Capability resolver upstream enforces sensible
    // combinations (e.g. diarize forces audioEnabled true).
    if (enabled)      startRecorder(stream);
    if (audioEnabled) startAudioRecorder(stream);
  }, [enabled, audioEnabled]); // eslint-disable-line react-hooks/exhaustive-deps

  const onLeave = useCallback(() => {
    stoppedRef.current = true;
    try { recorderRef.current?.stop(); } catch { /* already stopped */ }
    recorderRef.current = null;
    // NEW: also stop the audio recorder. Safe to call even if it never started.
    try { audioRecorderRef.current?.stop(); } catch { /* already stopped */ }
    audioRecorderRef.current = null;
    if (uploadQueueRef.current.length === 0 && !uploadingRef.current) {
      setState("stopped");
    }
  }, []);

  // ── Return ────────────────────────────────────────────────────────────────
  // renderControls lives in RecordingIndicator.tsx — hook stays pure .ts
  // Wire it: const plugin = { ...recording.plugin, renderControls: () => <RecordingIndicator recording={recording} /> }

  const plugin: SessionPlugin = { onJoin, onLeave };

  return { state, chunkCount, errorMessage, plugin, audioChunkCount, switchStream };
}