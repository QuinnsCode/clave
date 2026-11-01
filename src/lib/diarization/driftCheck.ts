// src/lib/diarization/driftCheck.ts
//
// TEMPORARY — remove once karaoke timing is verified working.
// Marked for deletion. Don't build features on top of this.
//
// Drift check helpers: at any given `currentMs`, ask the diarization and the
// timeline who's talking. If they disagree, something is misaligned upstream
// (different source audio, version drift, wrong file loaded, etc.).
//
// Pure functions. No React. Used by useDriftCheck + DriftOverlay.

import type { DiarizedWord } from "./utterances";

// Loose timeline marker shape — matches TimelineData['markers'] entries we
// care about here. We only read "speaker-hold" markers; other kinds (gaps,
// silences) are ignored.
export interface SpeakerHoldMarker {
  kind:      "speaker-hold";
  speakerId: string;
  startSec:  number;
  endSec:    number;
}

export interface DriftSnapshot {
  currentMs:       number;
  currentSec:      number;
  diarSpeaker:     string | null;   // who's speaking per diarization (word match)
  diarWordText:    string | null;   // the word itself at this time
  diarWordIdx:     number;          // -1 if none
  diarWordRange:   { startMs: number; endMs: number } | null;
  timelineSpeaker: string | null;   // who's speaking per timeline markers
  agreement:       "match" | "mismatch" | "no-data";
  // Distance in ms between currentMs and the start of the active word — gives
  // a sense of how "into" the word we are. Useful when eyeballing if the
  // highlight is firing too early/late.
  msIntoWord:      number | null;
}

/**
 * Find the active diarization word at currentMs.
 *
 * Returns the index + word, or { idx: -1, word: null } if nothing matches.
 * First match wins (same rule as getActiveWords) so the overlay matches
 * what the karaoke view shows.
 */
export function findDiarWordAt(
  words: DiarizedWord[],
  currentMs: number,
): { idx: number; word: DiarizedWord | null } {
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (w.startMs <= currentMs && currentMs < w.endMs) {
      return { idx: i, word: w };
    }
  }
  return { idx: -1, word: null };
}

/**
 * Find which speaker holds the floor in the timeline at currentMs.
 *
 * Timeline markers are in seconds. We convert ms→sec internally.
 * Returns null if no marker covers this moment (e.g. silence segments).
 */
export function getTimelineSpeakerAt(
  markers: SpeakerHoldMarker[] | undefined | null,
  currentMs: number,
): string | null {
  if (!markers || markers.length === 0) return null;
  const sec = currentMs / 1000;
  for (const m of markers) {
    if (m.kind !== "speaker-hold") continue;
    if (sec >= m.startSec && sec < m.endSec) return m.speakerId;
  }
  return null;
}

/**
 * Build a full diagnostic snapshot at currentMs. Inputs are nullable so the
 * overlay can render whatever it has — the snapshot reports "no-data" when
 * either side is missing.
 */
export function buildDriftSnapshot(
  words:    DiarizedWord[] | undefined | null,
  markers:  SpeakerHoldMarker[] | undefined | null,
  currentMs: number,
): DriftSnapshot {
  const wordList = words ?? [];
  const { idx, word } = findDiarWordAt(wordList, currentMs);

  const diarSpeaker     = word?.speaker ?? null;
  const timelineSpeaker = getTimelineSpeakerAt(markers, currentMs);

  let agreement: DriftSnapshot["agreement"];
  if (diarSpeaker === null && timelineSpeaker === null) {
    agreement = "no-data";
  } else if (diarSpeaker === null || timelineSpeaker === null) {
    // One side has data, the other doesn't — that's still a mismatch worth
    // flagging in the overlay (e.g. diarization says someone's talking but
    // timeline has nobody in this moment).
    agreement = "mismatch";
  } else {
    agreement = diarSpeaker === timelineSpeaker ? "match" : "mismatch";
  }

  return {
    currentMs,
    currentSec:      currentMs / 1000,
    diarSpeaker,
    diarWordText:    word?.text ?? null,
    diarWordIdx:     idx,
    diarWordRange:   word ? { startMs: word.startMs, endMs: word.endMs } : null,
    timelineSpeaker,
    agreement,
    msIntoWord:      word ? currentMs - word.startMs : null,
  };
}