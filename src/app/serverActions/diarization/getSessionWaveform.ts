"use server";
// src/app/serverActions/diarization/getSessionWaveform.ts
//
// Server action that fetches and parses the waveform.dat artifact for one
// peer of one session. Returns normalized amplitude data ready for the
// timeline UI to render — no client-side binary parsing required.
//
// Signature matches getSessionRecording / getSessionDiarization for consistency:
//   (sessionId, userId, orgId, peerId) → SessionWaveformView | null
//
// R2 path prefix:
//   Uses orgId if set (new rooms, org-scoped). Falls back to userId for rooms
//   created before orgId was stored. Hard returns null if neither exists.
//   This matches the write path in presign.ts — always orgId ?? userId.
//
// Returns null if:
//   - sessionId/peerId missing, or both userId and orgId missing
//   - waveform.dat doesn't exist at the conventional R2 path (the post-
//     processing pipeline may have failed waveform generation while still
//     completing the audio + diarization — non-fatal by design)

import { env } from "cloudflare:workers";
import {
  waveformKey,
  parseWaveformHeader,
  headerBytesFor,
} from "@/lib/diarization/waveform";

export interface SessionWaveformView {
  // Source metadata (from the .dat header)
  sampleRate:        number;   // Hz (we generate 8000)
  samplesPerPixel:   number;   // audio samples per bucket
  bucketCount:       number;   // length of `amplitudes` array
  secondsPerBucket:  number;   // = samplesPerPixel / sampleRate
  durationSec:       number;   // = secondsPerBucket * bucketCount

  // Normalized peaks: max(|min|, |max|) per bucket, scaled to [0, 1].
  // One value per time bucket. Use this directly for canvas drawing —
  // multiply by render height for bar height.
  amplitudes:        number[];
}

export async function getSessionWaveform(
  sessionId: string,
  userId:    string,
  orgId:     string,
  peerId:    string,
): Promise<SessionWaveformView | null> {
  if (!sessionId || (!userId && !orgId) || !peerId) return null;

  // ── Resolve path prefix ─────────────────────────────────────────────────
  // orgId is correct for new rooms. userId is the fallback for old rooms
  // created before orgId was stored. Matches presign.ts write path exactly.
  const pathId = orgId || userId;
  if (!pathId) return null;

  // ── Fetch from R2 ───────────────────────────────────────────────────────
  const key = waveformKey(pathId, sessionId, peerId);
  const obj = await (env as any).RECORDING_BUCKET.get(key);
  if (!obj) return null;

  const buf = new Uint8Array(await obj.arrayBuffer());
  if (buf.byteLength < 20) {
    // File exists but is too short to even be a valid v1 header.
    // Treat as missing rather than crashing the UI.
    console.warn(`[getSessionWaveform] file too short (${buf.byteLength}B) at ${key}`);
    return null;
  }

  // ── Parse header ────────────────────────────────────────────────────────
  const view       = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const header     = parseWaveformHeader(view);
  const dataOffset = headerBytesFor(header.version);

  // ── Decode peak data → normalized amplitudes ────────────────────────────
  // Peak data is interleaved (min, max) pairs per bucket. We collapse to
  // a single envelope value per bucket: max(|min|, |max|) normalized to
  // [0, 1]. This is what canvas rendering wants — bar height in [0, 1].
  //
  // 8-bit: each sample is int8 in range [-128, 127]; normalize by 127.
  // 16-bit: each sample is int16 in range [-32768, 32767]; normalize by 32767.
  const amplitudes: number[] = new Array(header.length);

  if (header.is8Bit) {
    const pcm = new Int8Array(buf.buffer, buf.byteOffset + dataOffset);
    for (let i = 0; i < header.length; i++) {
      const min  = pcm[i * 2];
      const max  = pcm[i * 2 + 1];
      const peak = Math.max(Math.abs(min), Math.abs(max));
      amplitudes[i] = peak / 127;
    }
  } else {
    // 16-bit path — not what our container generates today (we use --bits 8),
    // but parser handles it in case we change that or import external files.
    const pcm = new Int16Array(buf.buffer, buf.byteOffset + dataOffset);
    for (let i = 0; i < header.length; i++) {
      const min  = pcm[i * 2];
      const max  = pcm[i * 2 + 1];
      const peak = Math.max(Math.abs(min), Math.abs(max));
      amplitudes[i] = peak / 32767;
    }
  }

  const secondsPerBucket = header.samplesPerPixel / header.sampleRate;
  const durationSec      = secondsPerBucket * header.length;

  return {
    sampleRate:       header.sampleRate,
    samplesPerPixel:  header.samplesPerPixel,
    bucketCount:      header.length,
    secondsPerBucket,
    durationSec,
    amplitudes,
  };
}