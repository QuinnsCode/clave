// src/lib/diarization/activeWords.ts
//
// Pure helper: given a flat words array and a current playback time,
// return which words are currently being spoken — keyed by speaker.
//
// Why per-speaker (and not just "the one current word"):
//   When two speakers genuinely talk simultaneously, each bubble should
//   highlight its own current word. A single "the one current word" model
//   would pick one and leave the other un-highlighted.
//
// Why first-match wins within a speaker:
//   Standard karaoke / caption behavior. The audio at any given millisecond
//   is on ONE word. When the diarizer emits overlapping word ranges (e.g.
//   "foot" 15760-16480 + "steps" 15975-16615), the audio is still on the
//   earlier word until that word finishes — picking the later-starting
//   word would make the highlight jump ahead of what you hear. First match
//   = earlier-starting = the word audio is actually on.
//
// No IO, no React, no env access — fully testable in isolation.

import type { DiarizedWord } from "./utterances";

/**
 * Map of speakerId → global word index that's currently active for that
 * speaker. Absent key means no active word for that speaker at currentMs.
 */
export type ActiveWordsMap = Map<string, number>;

/**
 * Find currently-active words at `currentMs`, one per speaker.
 *
 * Active = `startMs <= currentMs < endMs`. Strict < on endMs avoids a word
 * being "still current" the moment its successor starts.
 *
 * When the diarizer emits overlapping words for a single speaker, the
 * first one (lower startMs, earlier in the array) wins. This is what
 * audio is actually playing — the second overlapping word is the diarizer
 * saying "I started detecting the next word here", but the previous word's
 * audio is still finishing. Standard karaoke / caption behavior.
 *
 * Linear scan. words[] is typically <1000 for a session — well under 1ms.
 * Upgrade to interval tree if we ever see 10k+ words per session.
 */
export function getActiveWords(
  words: DiarizedWord[],
  currentMs: number,
): ActiveWordsMap {
  const out = new Map<string, number>();

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (w.startMs <= currentMs && currentMs < w.endMs) {
      // First match per speaker wins.
      if (!out.has(w.speaker)) {
        out.set(w.speaker, i);
      }
    }
  }

  return out;
}

/**
 * Convenience: pick the single "current" active word across all speakers.
 * First match wins (same rule as getActiveWords) — earlier-starting word
 * in overlap regions is the one audio is on.
 *
 * Returns -1 if no word is active.
 *
 * NOTE: for the bubble karaoke view, prefer `getActiveWords` — multi-speaker
 * simultaneous talking should show multiple highlights, not just one.
 */
export function getPrimaryActiveWord(
  words: DiarizedWord[],
  currentMs: number,
): number {
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (w.startMs <= currentMs && currentMs < w.endMs) {
      return i;
    }
  }
  return -1;
}