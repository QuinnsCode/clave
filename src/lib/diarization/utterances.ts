// src/lib/diarization/utterances.ts
//
// Pure helper: groups a flat word list (from diarization) into per-speaker
// utterances suitable for bubble rendering.
//
// Rules:
//   - New utterance when speaker changes
//   - New utterance when gap between words > gapMs (default 1500ms)
//   - Words concatenated with spaces; first letter of utterance capitalized
//
// No IO, no React, no env access — testable in isolation.
//
// CHANGED (R1 pods pass) — Utterance now also carries:
//   - words: DiarizedWord[]  — the raw words that make up the utterance,
//                              needed for per-word karaoke highlight + edit UI.
//   - wordStartIndex: number — index of the first word in the parent words[]
//                              array. Lets edit UI address words by their
//                              global index (matches WordOverrides shape).
//
// Plus four new exports for the pods/anchors UI:
//   - WordOverrides         — JSON shape stored in SessionDiarization.wordOverrides
//   - parseWordOverrides    — safe JSON parse with defaults
//   - applyEditsToWords     — replace word.text where an edit exists
//   - findWordIndexAtMs     — for karaoke highlight (binary-search-friendly)

export interface DiarizedWord {
    text:       string;
    startMs:    number;
    endMs:      number;
    speaker:    string;
    confidence?: number;
  }

  export interface Utterance {
    speaker:   string;
    startMs:   number;
    endMs:     number;
    text:      string;
    wordCount: number;
    // NEW (R1 pods pass)
    words:          DiarizedWord[];   // raw words composing this utterance
    wordStartIndex: number;           // index of the first word in the parent words[] array
  }

  interface GroupOpts {
    gapMs?: number; // default 1500
  }

  export function groupWordsToUtterances(
    words: DiarizedWord[],
    opts: GroupOpts = {},
  ): Utterance[] {
    const gapMs = opts.gapMs ?? 1500;

    if (!words || words.length === 0) return [];

    const out: Utterance[] = [];
    // CHANGED (R1 pods pass) — track the actual word objects and the global
    // start index, not just tokens. We need both for the edit-mode UI.
    let current: {
      speaker:        string;
      startMs:        number;
      endMs:          number;
      tokens:         string[];
      words:          DiarizedWord[];
      wordStartIndex: number;
    } | null = null;

    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      const shouldStartNew =
        !current ||
        w.speaker !== current.speaker ||
        w.startMs - current.endMs > gapMs;

      if (shouldStartNew) {
        if (current) out.push(finalize(current));
        current = {
          speaker:        w.speaker,
          startMs:        w.startMs,
          endMs:          w.endMs,
          tokens:         [w.text],
          words:          [w],
          wordStartIndex: i,           // global index of this word
        };
      } else {
        current!.tokens.push(w.text);
        current!.words.push(w);
        current!.endMs = Math.max(current!.endMs, w.endMs);
      }
    }

    if (current) out.push(finalize(current));

    return out;
  }

  function finalize(c: {
    speaker:        string;
    startMs:        number;
    endMs:          number;
    tokens:         string[];
    words:          DiarizedWord[];
    wordStartIndex: number;
  }): Utterance {
    const raw = c.tokens.join(" ").trim();
    // Capitalize first character — words from nova-3 are lowercase tokens
    const text = raw.length > 0 ? raw[0].toUpperCase() + raw.slice(1) : raw;
    return {
      speaker:        c.speaker,
      startMs:        c.startMs,
      endMs:          c.endMs,
      text,
      wordCount:      c.tokens.length,
      words:          c.words,
      wordStartIndex: c.wordStartIndex,
    };
  }

  // Format a millisecond timestamp as "m:ss" or "h:mm:ss"
  export function formatTimestamp(ms: number): string {
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

// ── NEW (R1 pods pass): WordOverrides shape + helpers ──────────────────────
//
// Stored on SessionDiarization.wordOverrides as JSON. Shape is changelog-
// ready: each edit carries timestamp + original so we can promote to a true
// history view later without migration.
//
// v1 keeps one edit per wordIndex (overwrite). v2+ may append.

export interface WordEdit {
  wordIndex: number;
  original:  string;    // what diarization originally said
  text:      string;    // user's correction
  at:        string;    // ISO timestamp
}

export interface WordOverrides {
  edits: WordEdit[];    // one entry per edited word (v1: dedup'd by wordIndex)
  locks: number[];      // word indices marked read-only
}

export const EMPTY_OVERRIDES: WordOverrides = { edits: [], locks: [] };

/**
 * Safe parse for the JSON blob on disk. Returns EMPTY_OVERRIDES on
 * null/malformed input so callers never have to null-check shape.
 */
export function parseWordOverrides(raw: string | null | undefined): WordOverrides {
  if (!raw) return { edits: [], locks: [] };
  try {
    const parsed = JSON.parse(raw);
    const edits = Array.isArray(parsed.edits) ? parsed.edits : [];
    const locks = Array.isArray(parsed.locks) ? parsed.locks : [];
    return { edits, locks };
  } catch {
    return { edits: [], locks: [] };
  }
}

/**
 * Apply edits to a words array, returning a new array with .text replaced
 * for any indexed edit. Used by getSessionDiarization on read so the UI
 * sees corrected text without doing its own merge.
 *
 * Doesn't mutate input. O(n) over words + O(e) over edits.
 */
export function applyEditsToWords(
  words: DiarizedWord[],
  edits: WordEdit[],
): DiarizedWord[] {
  if (edits.length === 0) return words;

  // Build an index → text map (last edit per index wins, matches storage rule)
  const editMap = new Map<number, string>();
  for (const e of edits) editMap.set(e.wordIndex, e.text);

  return words.map((w, i) => {
    const replacement = editMap.get(i);
    return replacement !== undefined ? { ...w, text: replacement } : w;
  });
}

/**
 * Karaoke highlight helper. Find the index of the word being spoken at
 * `currentMs`. Returns -1 if no word matches (before first / after last /
 * during a gap).
 *
 * Linear scan — words[] is typically <1000 entries for typical sessions,
 * so this is well under 1ms. Upgrade to binary search if needed later.
 */
export function findWordIndexAtMs(words: DiarizedWord[], currentMs: number): number {
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (currentMs >= w.startMs && currentMs < w.endMs) return i;
    if (w.startMs > currentMs) return -1;   // we've passed it
  }
  return -1;
}