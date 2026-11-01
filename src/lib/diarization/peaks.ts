// src/lib/diarization/peaks.ts
//
// Pure helpers for waveform peaks data.
//
// Two sides know about peaks:
//   - The container generates them (audiowaveform → peaks.dat binary)
//   - The client (or future server action) reads them to render the timeline
//
// This file is the SHARED Worker-side knowledge:
//   - The R2 path convention (peaksKey)
//   - The resolution policy (pickPeaksResolution) — duplicated in container/diarize/server.ts
//     intentionally; the container picks its own resolution to avoid an extra
//     round trip. Worker-side copy exists for future cases (manual regen, backfill).
//   - The .dat header layout (PeaksHeader)
//
// No IO, no env access — testable in isolation.

// ── R2 path ──────────────────────────────────────────────────────────────────

export function peaksKey(orgId: string, sessionId: string, peerId: string): string {
    return `${orgId}/${sessionId}/${peerId}/peaks.dat`;
  }
  
  // ── Resolution policy ────────────────────────────────────────────────────────
  //
  // Returns the audiowaveform `--pixels-per-second` value. Tiny files at every
  // session length, enough detail to "find where I spoke" at a glance.
  //
  // IMPORTANT: This must stay in sync with the container's pickPeaksPps in
  // container/diarize/server.ts. The container is authoritative — it picks at
  // generation time. This Worker-side copy is for future tooling (regenerate
  // peaks for old sessions, validate that container output matches expectations,
  // etc.). If you change the policy, change both places.
  
  export function pickPeaksResolution(durationSec: number): string {
    if (durationSec < 300)  return "1";       // < 5 min:  1-sec buckets
    if (durationSec < 3600) return "0.2";     // < 1 hr:   5-sec buckets
    return "0.0333";                          // ≥ 1 hr:   30-sec buckets
  }
  
  // ── .dat header layout ──────────────────────────────────────────────────────
  //
  // audiowaveform .dat format (version 2):
  //   bytes  0-3:  version          (int32, LE) — 1 or 2
  //   bytes  4-7:  flags            (int32, LE) — bit 0 set = 8-bit data
  //   bytes  8-11: sample rate      (int32, LE) — Hz
  //   bytes 12-15: samples per pixel (int32, LE) — audio samples per peak
  //   bytes 16-19: length            (int32, LE) — number of min/max pairs
  //   bytes 20-23: channels         (int32, LE) — v2 only; v1 implicit mono
  //   bytes 24+:   data — interleaved min/max pairs as signed bytes (or int16)
  //
  // Reference: https://github.com/bbc/audiowaveform/blob/master/doc/DataFormat.md
  
  export interface PeaksHeader {
    version:         number;
    is8Bit:          boolean;   // true = bytes 24+ are int8; false = int16
    sampleRate:      number;
    samplesPerPixel: number;
    length:          number;    // count of min/max pairs
    channels:        number;
  }
  
  export const PEAKS_HEADER_BYTES = 24;