// src/lib/diarization/waveform.ts
//
// Pure helpers for the waveform data (`waveform.dat` in R2). The binary
// format inside the file is called "peaks" by the tool that generates it
// (BBC's audiowaveform) — we preserve that term for format-specific things
// like the byte layout, but at the surface of the codebase the artifact is
// the "waveform".
//
// Two sides know about waveforms:
//   - The container generates them (audiowaveform → waveform.dat binary)
//   - The client (or future server action) reads them to render the timeline
//
// This file is the SHARED Worker-side knowledge:
//   - The R2 path convention (waveformKey)
//   - The resolution policy (pickWaveformResolution) — duplicated in
//     container/diarize/server.ts intentionally; the container picks its own
//     resolution to avoid an extra round trip. This Worker-side copy exists
//     for future tooling (manual regen, backfill).
//   - The .dat header layout (WaveformHeader, headerBytesFor)
//
// No IO, no env access — testable in isolation.

// ── R2 path ──────────────────────────────────────────────────────────────────

export function waveformKey(orgId: string, sessionId: string, peerId: string): string {
    return `${orgId}/${sessionId}/${peerId}/waveform.dat`;
  }
  
  // ── Resolution policy ────────────────────────────────────────────────────────
  //
  // Returns the audiowaveform `--pixels-per-second` value. Tiny files at every
  // session length, enough detail to "find where I spoke" at a glance.
  //
  // IMPORTANT: This must stay in sync with the container's pickWaveformPps in
  // container/diarize/server.ts. The container is authoritative — it picks at
  // generation time. This Worker-side copy is for future tooling (regenerate
  // waveforms for old sessions, validate that container output matches
  // expectations, etc.). If you change the policy, change both places.
  
  export function pickWaveformResolution(durationSec: number): string {
    if (durationSec < 300)  return "1";       // < 5 min:  1-sec buckets
    if (durationSec < 3600) return "0.2";     // < 1 hr:   5-sec buckets
    return "0.0333";                          // ≥ 1 hr:   30-sec buckets
  }
  
  // ── .dat header layout (peaks-format spec) ──────────────────────────────────
  //
  // audiowaveform .dat format reference:
  // https://github.com/bbc/audiowaveform/blob/master/doc/DataFormat.md
  //
  // VERSION 1 (header is 20 bytes):
  //   bytes  0-3:  version          (int32, LE) — value: 1
  //   bytes  4-7:  flags            (int32, LE) — bit 0 set = 8-bit data
  //   bytes  8-11: sample rate      (int32, LE) — Hz
  //   bytes 12-15: samples per pixel (int32, LE) — audio samples per peak
  //   bytes 16-19: length            (int32, LE) — number of min/max pairs
  //   bytes 20+:   data — interleaved min/max pairs as signed bytes (or int16)
  //
  // VERSION 2 (header is 24 bytes — adds channels field):
  //   bytes  0-3:  version          (int32, LE) — value: 2
  //   bytes  4-7:  flags
  //   bytes  8-11: sample rate
  //   bytes 12-15: samples per pixel
  //   bytes 16-19: length
  //   bytes 20-23: channels         (int32, LE) — v2 only
  //   bytes 24+:   data
  //
  // IMPORTANT: audiowaveform 1.10.2 writes VERSION 1 when --bits 8 is used
  // (our config). VERSION 2 is for multichannel; since we decode to mono, v1
  // is what we get. But the parser handles both for future-proofing.
  //
  // "Peaks" terminology here is intentional — that's what audiowaveform calls
  // the bytes inside its output format. The file itself is `waveform.dat`.
  
  export interface WaveformHeader {
    version:         number;
    is8Bit:          boolean;   // true = bytes after header are int8; false = int16
    sampleRate:      number;
    samplesPerPixel: number;
    length:          number;    // count of min/max pairs (bucket count)
    channels:        number;    // 1 for v1 (implicit mono); read from header for v2
  }
  
  /**
   * Returns the byte offset where peak data begins, given the .dat file version.
   * v1 → 20 bytes (no channels field)
   * v2 → 24 bytes (channels field added)
   */
  export function headerBytesFor(version: number): number {
    return version === 2 ? 24 : 20;
  }
  
  /**
   * Parse a waveform.dat header from a DataView positioned at byte 0.
   * Does not read peak data — caller does that based on header.is8Bit and
   * headerBytesFor(header.version).
   */
  export function parseWaveformHeader(view: DataView): WaveformHeader {
    const version         = view.getInt32(0,  true);
    const flags           = view.getInt32(4,  true);
    const sampleRate      = view.getInt32(8,  true);
    const samplesPerPixel = view.getInt32(12, true);
    const length          = view.getInt32(16, true);
  
    // channels: only present in v2. v1 is implicitly mono.
    const channels = version === 2 ? view.getInt32(20, true) : 1;
  
    return {
      version,
      is8Bit: (flags & 1) === 1,
      sampleRate,
      samplesPerPixel,
      length,
      channels,
    };
  }
  
  // Legacy export — kept so old imports compile. New code should use
  // headerBytesFor(version) instead since the value depends on file version.
  // (Most files we generate today are v1, so 20 is the typical value.)
  export const WAVEFORM_HEADER_BYTES = 20;