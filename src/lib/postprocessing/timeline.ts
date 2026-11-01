// src/lib/postprocessing/timeline.ts
//
// Pure functions that derive the multitrack timeline data from diarization
// utterances + the master waveform amplitudes. No I/O, no env, no DB —
// everything is in-memory math over data the pipeline already produced in
// earlier phases.
//
// The output of buildTimelineData() is what gets serialized to timeline.json
// in R2 at post-processing time. The UI fetches that file and renders it.
//
// Naming:
//   - "utterance" — one continuous speech span by one speaker (from diarization)
//   - "clip"      — a merged group of utterances by the same speaker. This is
//                   what gets drawn as a rectangle in the tracks view.
//   - "marker"    — a discrete annotation on the timeline (silence span,
//                   speaker-hold). Stored in the file for future UI to render
//                   as clickable jump points.
//
// IMPORTANT (data shape contract):
//   - Input utterances use the shape from @/lib/diarization/utterances:
//       { speaker: string; startMs: number; endMs: number; ... }
//     (FIXED — earlier version assumed {speakerId, startSec, endSec} which
//     didn't match the existing grouper's output. That mismatch silently
//     filtered every utterance out, producing empty timeline.json files.)
//   - Output to timeline.json uses SECONDS (startSec/endSec) on the wire so
//     the UI doesn't have to convert. ms→sec division happens once, here.
//
// Algorithm summary:
//   For each speaker:
//     1. Filter utterances to that speaker (match on `.speaker`).
//     2. Merge consecutive utterances with gaps < mergeGapSec.
//     3. Drop merged segments shorter than minClipSec (filters backchannels).
//     4. For each surviving segment, extract amplitudes from the master
//        waveform at the corresponding time range.
//   Silence markers: gaps > silenceMinSec across ALL utterances (not per
//   speaker — silences are global).
//
// All thresholds are baked into the output file's `thresholds` block so the
// UI knows what produced the data and we can detect stale files later if we
// change the algorithm.

// ── Input types (match @/lib/diarization/utterances exactly) ────────────────

/**
 * The grouped-utterance shape produced by groupWordsToUtterances.
 * Fields ending in `Ms` are in milliseconds; we convert to seconds internally.
 */
export interface UtteranceLite {
    speaker: string;
    startMs: number;
    endMs:   number;
  }
  
  export interface TimelineThresholds {
    mergeGapSec:   number;   // utterances closer than this gap → same clip
    minClipSec:    number;   // drop merged clips shorter than this
    silenceMinSec: number;   // gap longer than this → silence marker
  }
  
  export const DEFAULT_THRESHOLDS: TimelineThresholds = {
    mergeGapSec:   1.5,
    minClipSec:    1.0,
    silenceMinSec: 2.0,
  };
  
  // ── Output schema (mirrors timeline.json on disk) ────────────────────────────
  
  export interface TimelineClip {
    startSec:   number;
    endSec:     number;
    amplitudes: number[];   // normalized 0..1, one value per bucket in [startSec, endSec]
  }
  
  export interface TimelineSpeakerTrack {
    speakerId: string;     // canonical from result.speakers; matches utterance.speaker
    clips:     TimelineClip[];
  }
  
  export type TimelineMarker =
    | { kind: "silence";      startSec: number; endSec: number }
    | { kind: "speaker-hold"; speakerId: string; startSec: number; endSec: number };
  
  export interface TimelineData {
    version:       number;
    generatedAt:   string;        // ISO timestamp
    thresholds:    TimelineThresholds;
    durationSec:   number;
    bucketsPerSec: number;        // resolution of clip amplitudes (e.g., 1 = one sample per second)
    speakers:      TimelineSpeakerTrack[];
    markers:       TimelineMarker[];
  }
  
  // ── Helper: utterance ms-space → sec-space for the merge algorithm ──────────
  // Internal-only struct. The merge logic is easier to read in seconds (matches
  // our threshold units) so we convert once up front.
  
  interface UtteranceSec {
    speaker:  string;
    startSec: number;
    endSec:   number;
  }
  
  function toSecSpace(utterances: UtteranceLite[]): UtteranceSec[] {
    return utterances.map(u => ({
      speaker:  u.speaker,
      startSec: u.startMs / 1000,
      endSec:   u.endMs   / 1000,
    }));
  }
  
  // ── Step 1: merge utterances → clips for one speaker ────────────────────────
  
  interface RawClipBound {
    startSec: number;
    endSec:   number;
  }
  
  /**
   * Take a speaker's utterances (already filtered to one speaker, in seconds
   * space), merge consecutive ones with gap < mergeGapSec, and drop merged
   * segments shorter than minClipSec. Returns clip boundaries (no amplitudes
   * yet).
   *
   * Utterances are assumed to be sorted by startSec. If not, sort first.
   */
  export function mergeUtterancesIntoClips(
    utterances: UtteranceSec[],
    mergeGapSec: number,
    minClipSec:  number,
  ): RawClipBound[] {
    if (utterances.length === 0) return [];
  
    // Defensive sort — diarization usually emits them ordered, but don't trust.
    const sorted = [...utterances].sort((a, b) => a.startSec - b.startSec);
  
    const merged: RawClipBound[] = [];
    let current: RawClipBound = { startSec: sorted[0].startSec, endSec: sorted[0].endSec };
  
    for (let i = 1; i < sorted.length; i++) {
      const u = sorted[i];
      const gap = u.startSec - current.endSec;
  
      if (gap < mergeGapSec) {
        // Extend current clip
        current.endSec = Math.max(current.endSec, u.endSec);
      } else {
        // Close out current, start new
        merged.push(current);
        current = { startSec: u.startSec, endSec: u.endSec };
      }
    }
    merged.push(current);
  
    // Filter: drop clips shorter than minClipSec
    return merged.filter(c => (c.endSec - c.startSec) >= minClipSec);
  }
  
  // ── Step 2: extract amplitudes for a clip from master waveform ──────────────
  
  /**
   * Slice the master amplitudes array for the bucket range covered by [startSec, endSec].
   *
   * secondsPerBucket: how many seconds one bucket of the master waveform represents.
   * (Typically 1.0 since our container generates at pps=1 for short sessions.)
   *
   * The slice is inclusive on the start bucket and exclusive on the end bucket
   * (standard half-open range), so adjacent clips don't double-count buckets.
   */
  export function extractClipAmplitudes(
    startSec:         number,
    endSec:           number,
    masterAmplitudes: number[],
    secondsPerBucket: number,
  ): number[] {
    if (secondsPerBucket <= 0 || masterAmplitudes.length === 0) return [];
  
    const bucketStart = Math.max(0, Math.floor(startSec / secondsPerBucket));
    const bucketEnd   = Math.min(masterAmplitudes.length, Math.ceil(endSec / secondsPerBucket));
  
    if (bucketEnd <= bucketStart) return [];
    return masterAmplitudes.slice(bucketStart, bucketEnd);
  }
  
  // ── Step 3: silence detection ───────────────────────────────────────────────
  
  /**
   * Detect silence spans — gaps between ANY two consecutive utterances longer
   * than silenceMinSec. These are global silences (no one was talking), not
   * per-speaker.
   *
   * Also detects leading silence (before the first utterance) and trailing
   * silence (after the last utterance), if they're long enough to count.
   *
   * Accepts utterances in seconds space.
   */
  export function detectSilenceMarkers(
    utterances:    UtteranceSec[],
    durationSec:   number,
    silenceMinSec: number,
  ): Array<{ kind: "silence"; startSec: number; endSec: number }> {
    if (utterances.length === 0) {
      // Whole session is silence — only mark if it exceeds the threshold.
      return durationSec >= silenceMinSec
        ? [{ kind: "silence", startSec: 0, endSec: durationSec }]
        : [];
    }
  
    // Sort by start, then walk gaps.
    const sorted = [...utterances].sort((a, b) => a.startSec - b.startSec);
    const out: Array<{ kind: "silence"; startSec: number; endSec: number }> = [];
  
    // Leading silence — from 0 to first utterance start.
    if (sorted[0].startSec >= silenceMinSec) {
      out.push({ kind: "silence", startSec: 0, endSec: sorted[0].startSec });
    }
  
    // Between utterances. We track the running "high water mark" since
    // utterances can overlap (speaker A finishes while speaker B is already
    // mid-sentence). A silence only exists where the high water mark is below
    // the next utterance's start.
    let highWater = sorted[0].endSec;
    for (let i = 1; i < sorted.length; i++) {
      const u = sorted[i];
      const gap = u.startSec - highWater;
      if (gap >= silenceMinSec) {
        out.push({ kind: "silence", startSec: highWater, endSec: u.startSec });
      }
      if (u.endSec > highWater) highWater = u.endSec;
    }
  
    // Trailing silence — from last utterance end to durationSec.
    if (durationSec - highWater >= silenceMinSec) {
      out.push({ kind: "silence", startSec: highWater, endSec: durationSec });
    }
  
    return out;
  }
  
  // ── Step 4: build the whole timeline data structure ─────────────────────────
  
  export interface BuildTimelineInput {
    utterances:       UtteranceLite[];        // {speaker, startMs, endMs, ...} from groupWordsToUtterances
    speakers:         string[];               // canonical speaker order (result.speakers)
    masterAmplitudes: number[];               // from waveform.dat
    secondsPerBucket: number;                 // from waveform.dat header (samplesPerPixel / sampleRate)
    durationSec:      number;
    thresholds?:      TimelineThresholds;     // defaults applied if absent
  }
  
  /**
   * Top-level: build the complete timeline data structure ready to JSON.stringify
   * and write to R2. Pure function — no I/O.
   */
  export function buildTimelineData(input: BuildTimelineInput): TimelineData {
    const thresholds = input.thresholds ?? DEFAULT_THRESHOLDS;
    const { speakers, masterAmplitudes, secondsPerBucket, durationSec } = input;
  
    // Convert utterances ms → sec once, up front. All subsequent math is in seconds.
    const utterancesSec = toSecSpace(input.utterances);
  
    // bucketsPerSec is the reciprocal of secondsPerBucket. Stored in the file
    // so the UI doesn't need to recompute or guess.
    const bucketsPerSec = secondsPerBucket > 0 ? 1 / secondsPerBucket : 1;
  
    // ── Per-speaker tracks ────────────────────────────────────────────────
    // Filter on `.speaker` (matches Utterance type). The output struct uses
    // `speakerId` for the UI's convenience — same string, different field name.
    const tracks: TimelineSpeakerTrack[] = speakers.map(speakerId => {
      const own       = utterancesSec.filter(u => u.speaker === speakerId);
      const rawClips  = mergeUtterancesIntoClips(own, thresholds.mergeGapSec, thresholds.minClipSec);
      const clips: TimelineClip[] = rawClips.map(c => ({
        startSec:   c.startSec,
        endSec:     c.endSec,
        amplitudes: extractClipAmplitudes(c.startSec, c.endSec, masterAmplitudes, secondsPerBucket),
      }));
      return { speakerId, clips };
    });
  
    // ── Markers ───────────────────────────────────────────────────────────
    // Silence markers — global gaps with no one talking.
    const silenceMarkers = detectSilenceMarkers(utterancesSec, durationSec, thresholds.silenceMinSec);
  
    // Speaker-hold markers — each clip's bounds. Surfaced as markers so future
    // UI (jump-to-next-time-I-spoke) can use them directly without re-walking
    // the clips array.
    const holdMarkers: Array<TimelineMarker> = [];
    for (const track of tracks) {
      for (const clip of track.clips) {
        holdMarkers.push({
          kind:      "speaker-hold",
          speakerId: track.speakerId,
          startSec:  clip.startSec,
          endSec:    clip.endSec,
        });
      }
    }
  
    // Sort all markers by start time for consumer convenience.
    const markers: TimelineMarker[] = [...silenceMarkers, ...holdMarkers].sort(
      (a, b) => a.startSec - b.startSec
    );
  
    return {
      version:       1,
      generatedAt:   new Date().toISOString(),
      thresholds,
      durationSec,
      bucketsPerSec,
      speakers:      tracks,
      markers,
    };
  }
  
  // ── R2 path convention ──────────────────────────────────────────────────────
  
  export function timelineKey(orgId: string, sessionId: string, peerId: string): string {
    return `${orgId}/${sessionId}/${peerId}/timeline.json`;
  }