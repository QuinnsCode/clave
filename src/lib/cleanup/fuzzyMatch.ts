// src/lib/cleanup/fuzzyMatch.ts
//
// Pure logic for matching diarization words against pod anchors.
// No IO, no React, no env — fully unit-testable in isolation.
//
// THE PROBLEM:
//   Diarization mishears proper nouns and jargon. "qlave" → "clave",
//   "GraphQL" → "graph QL", "Kelly" → "Kelvy". Pod anchors give us the
//   canonical list of "should-be" terms.
//
// THE APPROACH:
//   For each anchor, scan diarization words and score each candidate
//   match using:
//     - Normalized Levenshtein distance (catches near-misses by character)
//     - Metaphone (catches phonetic confusion — "Ryan" vs "Ryen")
//     - Word confidence (low-confidence words are more suspicious)
//   Sum weighted scores → above threshold = applied edit.
//
// WHAT THIS DOES NOT DO:
//   - Multi-word anchors as phrases ("New York City" matching three
//     consecutive words). v1: anchor whitespace becomes underscore and we
//     try single-token match against the underscore version. Real n-gram
//     matching is v2.
//   - LLM disambiguation. v1 is fuzzy-only; LLM fallback is a separate
//     iteration.
//   - Reflowing utterance text. We only emit WordEdits — Utterance
//     rebuilding happens downstream in groupWordsToUtterances which already
//     applies edits from overrides before grouping.

import type { DiarizedWord, WordEdit, WordOverrides } from "@/lib/diarization/utterances";

// ── Public API ──────────────────────────────────────────────────────────────

export interface AnchorCandidate {
  /** Index into the original words[] array. */
  wordIndex:    number;
  /** Original word text before any edit. */
  original:     string;
  /** Anchor canonical that matched. */
  anchor:       string;
  /** Final scoring blend, 0..1. Higher = stronger match. */
  score:        number;
  /** Normalized Levenshtein similarity, 0..1. */
  levSim:       number;
  /** Metaphone code equality, 1 if metaphones match else 0. */
  phoneticMatch: number;
  /** Original word's diarization confidence (defaulted to 1 if absent). */
  confidence:   number;
  /** What the edit's text will be (anchor + smart casing). */
  proposedText: string;
}

export interface FindAnchorEditsResult {
  /** Edits to apply (score ≥ threshold, not locked, casing applied). */
  edits:      WordEdit[];
  /** All candidates considered (above min-similarity floor). For audit. */
  candidates: AnchorCandidate[];
  /** Anchors with no candidates above threshold. For diagnostics. */
  unmatchedAnchors: string[];
}

export interface FindAnchorEditsOpts {
  /** Score threshold for edit to be applied. Default 0.7. */
  threshold?:    number;
  /** Below this lev similarity, skip the candidate entirely. Default 0.55. */
  minLevSim?:    number;
  /** Word indices that must not be edited (manual locks). */
  lockedIndices?: number[];
  /** ISO timestamp written into the WordEdit. Default now. */
  at?:           string;
}

const DEFAULT_THRESHOLD  = 0.7;
const DEFAULT_MIN_LEV    = 0.55;

/**
 * Main entry. Returns edits to apply + an audit list of all candidates.
 *
 * Scoring blend (when phonetic matches):
 *   score = 0.5 * levSim + 0.3 * phoneticMatch + 0.2 * (1 - confidence)
 *
 * When phonetic doesn't match:
 *   score = 0.7 * levSim + 0.3 * (1 - confidence)
 *
 * The low-confidence boost is intentional: if diarization was unsure, we
 * trust the anchor more. If diarization was certain it heard "ran" cleanly,
 * we shouldn't replace it with "Ryan" on lev distance alone.
 */
export function findAnchorEdits(
  words:    DiarizedWord[],
  anchors:  string[],
  opts:     FindAnchorEditsOpts = {},
): FindAnchorEditsResult {
  const threshold  = opts.threshold  ?? DEFAULT_THRESHOLD;
  const minLevSim  = opts.minLevSim  ?? DEFAULT_MIN_LEV;
  const lockedSet  = new Set(opts.lockedIndices ?? []);
  const at         = opts.at ?? new Date().toISOString();

  const candidates: AnchorCandidate[] = [];
  const matchedAnchors = new Set<string>();

  for (const anchor of anchors) {
    if (!anchor || !anchor.trim()) continue;
    const anchorNorm = normalizeForCompare(anchor);
    const anchorMeta = metaphone(anchorNorm);

    for (let i = 0; i < words.length; i++) {
      if (lockedSet.has(i)) continue;
      const w = words[i];
      if (!w.text) continue;

      const wordNorm = normalizeForCompare(w.text);

      // Don't propose an edit if the word already matches the anchor.
      if (wordNorm === anchorNorm) {
        matchedAnchors.add(anchor);
        continue;
      }

      const levSim = levenshteinSimilarity(wordNorm, anchorNorm);
      if (levSim < minLevSim) continue;

      const wordMeta      = metaphone(wordNorm);
      const phoneticMatch = wordMeta && anchorMeta && wordMeta === anchorMeta ? 1 : 0;
      const confidence    = typeof w.confidence === "number" ? w.confidence : 1;

      const score = scoreCandidate({ levSim, phoneticMatch, confidence });

      const proposedText = applySmartCasing({
        anchor,
        originalWord: w.text,
        wordIndex:    i,
        words,
      });

      candidates.push({
        wordIndex:     i,
        original:      w.text,
        anchor,
        score,
        levSim,
        phoneticMatch,
        confidence,
        proposedText,
      });

      if (score >= threshold) matchedAnchors.add(anchor);
    }
  }

  // For each wordIndex, only keep the highest-scoring candidate.
  // Anchor A and anchor B could both fuzzy-match the same word; pick the
  // stronger.
  const byIndex = new Map<number, AnchorCandidate>();
  for (const c of candidates) {
    const existing = byIndex.get(c.wordIndex);
    if (!existing || c.score > existing.score) {
      byIndex.set(c.wordIndex, c);
    }
  }

  const edits: WordEdit[] = [];
  for (const c of byIndex.values()) {
    if (c.score >= threshold) {
      edits.push({
        wordIndex: c.wordIndex,
        original:  c.original,
        text:      c.proposedText,
        at,
      });
    }
  }

  // Stable order: by wordIndex ascending. Easier to diff in the R2 audit.
  edits.sort((a, b) => a.wordIndex - b.wordIndex);
  candidates.sort((a, b) => a.wordIndex - b.wordIndex || b.score - a.score);

  const unmatchedAnchors = anchors.filter(a => a.trim() && !matchedAnchors.has(a));

  return { edits, candidates, unmatchedAnchors };
}

// ── Casing rules ────────────────────────────────────────────────────────────

interface CasingArgs {
  anchor:       string;
  originalWord: string;
  wordIndex:    number;
  words:        DiarizedWord[];
}

/**
 * Decide what the edit text should be.
 *
 * Rules (simplest version):
 *   - Use anchor's stored casing verbatim by default
 *   - If position is sentence-initial (first word, or follows a word ending
 *     in . ? !), uppercase the first letter
 *   - If the anchor already starts with an uppercase letter, leave it
 *
 * NOT done in v1: ALL-CAPS detection, mid-word capitalization preservation
 * (we trust the anchor's stored form).
 */
function applySmartCasing(args: CasingArgs): string {
  const { anchor, wordIndex, words } = args;

  if (!anchor) return anchor;

  // If anchor already starts capitalized, use as-is.
  if (/^[A-Z]/.test(anchor)) return anchor;

  // Sentence-initial check: first word OR previous word ends with terminal punctuation.
  let sentenceInitial = false;
  if (wordIndex === 0) {
    sentenceInitial = true;
  } else {
    const prev = words[wordIndex - 1];
    if (prev?.text && /[.?!]$/.test(prev.text.trim())) {
      sentenceInitial = true;
    }
  }

  if (sentenceInitial) {
    return anchor[0].toUpperCase() + anchor.slice(1);
  }
  return anchor;
}

// ── Scoring ─────────────────────────────────────────────────────────────────

function scoreCandidate(args: {
  levSim:        number;
  phoneticMatch: number;
  confidence:    number;
}): number {
  const { levSim, phoneticMatch, confidence } = args;
  const confidenceBoost = 1 - clamp(confidence, 0, 1);

  if (phoneticMatch) {
    return clamp(0.5 * levSim + 0.3 * phoneticMatch + 0.2 * confidenceBoost, 0, 1);
  }
  return clamp(0.7 * levSim + 0.3 * confidenceBoost, 0, 1);
}

// ── Levenshtein ─────────────────────────────────────────────────────────────
//
// Classic two-row DP. O(m*n) time, O(min(m,n)) space.
// For anchor-vs-word use (short strings, typically 3-15 chars), this is fast
// enough that we don't need a more sophisticated algorithm.

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  // Ensure b is the longer string so we minimize the row size.
  if (a.length > b.length) [a, b] = [b, a];

  let prev = new Array(a.length + 1);
  let curr = new Array(a.length + 1);
  for (let i = 0; i <= a.length; i++) prev[i] = i;

  for (let j = 1; j <= b.length; j++) {
    curr[0] = j;
    for (let i = 1; i <= a.length; i++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[i] = Math.min(
        curr[i - 1] + 1,        // insert
        prev[i]     + 1,        // delete
        prev[i - 1] + cost,     // substitute
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[a.length];
}

/** 0..1 similarity. 1 = identical, 0 = nothing in common. */
export function levenshteinSimilarity(a: string, b: string): number {
  if (!a.length && !b.length) return 1;
  const dist   = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - dist / maxLen;
}

// ── Metaphone ───────────────────────────────────────────────────────────────
//
// Simplified Metaphone (Lawrence Philips, 1990). Produces a 4-6 character
// code representing how the word sounds in English. Two words with the same
// code "sound alike" by Anglo-Saxon phonetics. Good enough for catching
// "qlave/clave", "Ryan/Ryen", "Kelly/Kelvy".
//
// This is a hand-rolled subset of the original spec. Coverage is adequate
// for typical English proper nouns + jargon; not exhaustive. Not Soundex
// (which is much less accurate).

export function metaphone(input: string): string {
  if (!input) return "";

  let word = input.toUpperCase().replace(/[^A-Z]/g, "");
  if (!word) return "";

  // ── Initial letter rules ─────────────────────────────────────────────
  // Drop silent leading letters; convert digraphs.
  if (/^(AE|GN|KN|PN|WR)/.test(word)) word = word.slice(1);
  if (word[0] === "X") word = "S" + word.slice(1);          // X -> S at start (Xerox = "Zerox")
  if (/^WH/.test(word)) word = "W" + word.slice(2);

  let out = "";
  const len = word.length;

  for (let i = 0; i < len; i++) {
    const c    = word[i];
    const next = word[i + 1] ?? "";
    const prev = word[i - 1] ?? "";
    const next2 = word[i + 2] ?? "";

    // Skip duplicate consonants (but allow double C: "ACCEPT")
    if (c === prev && c !== "C") continue;

    switch (c) {
      case "A": case "E": case "I": case "O": case "U":
        if (i === 0) out += c;
        // Vowels otherwise dropped
        break;

      case "B":
        // Silent B at end after M (LAMB)
        if (!(i === len - 1 && prev === "M")) out += "B";
        break;

      case "C":
        if (next === "H") {
          // CH → X (CHURCH) unless CIA/CIO (then S)
          out += "X";
          i++; // consume H
        } else if (next === "I" && next2 === "A") {
          out += "X";
        } else if ("IEY".includes(next)) {
          out += "S";
        } else {
          out += "K";
        }
        break;

      case "D":
        if (next === "G" && "IEY".includes(next2)) {
          out += "J";
          i++; // consume G
        } else {
          out += "T";
        }
        break;

      case "F": out += "F"; break;

      case "G":
        if (next === "H") {
          // GH → silent (THOUGH, ROUGH); except when before vowel at start
          // Simplification: drop GH entirely.
          i++; // consume H
        } else if (next === "N" && i === len - 2) {
          // Silent G before N at end (SIGN). Drop G.
        } else if ("IEY".includes(next)) {
          out += "J";
        } else {
          out += "K";
        }
        break;

      case "H":
        // H silent if no vowel follows
        if ("AEIOU".includes(next)) out += "H";
        break;

      case "J": out += "J"; break;

      case "K":
        // K silent if preceded by C
        if (prev !== "C") out += "K";
        break;

      case "L": out += "L"; break;
      case "M": out += "M"; break;
      case "N": out += "N"; break;

      case "P":
        if (next === "H") {
          out += "F";
          i++; // consume H
        } else {
          out += "P";
        }
        break;

      case "Q": out += "K"; break;
      case "R": out += "R"; break;

      case "S":
        if (next === "H") {
          out += "X";
          i++; // consume H
        } else if (next === "I" && (next2 === "O" || next2 === "A")) {
          out += "X";
        } else {
          out += "S";
        }
        break;

      case "T":
        if (next === "H") {
          out += "0";  // 0 represents "th" sound (THIN)
          i++; // consume H
        } else if (next === "I" && (next2 === "O" || next2 === "A")) {
          out += "X";
        } else {
          out += "T";
        }
        break;

      case "V": out += "F"; break;

      case "W":
      case "Y":
        // Only output if followed by a vowel
        if ("AEIOU".includes(next)) out += c;
        break;

      case "X":
        out += "KS";
        break;

      case "Z":
        out += "S";
        break;
    }

    if (out.length >= 6) break;
  }

  return out;
}

// ── Lock-respecting merge ───────────────────────────────────────────────────
//
// Take the existing WordOverrides + freshly-computed cleanup edits, return
// the merged WordOverrides.
//
// Rules:
//   - Locked indices: never touched. Cleanup edits to locked indices are
//     dropped silently (the candidate list still records them for audit).
//   - Unlocked indices with existing edits: cleanup edit replaces the
//     existing. The original word still comes from the original word at
//     index (not from the prior edit), so re-running is idempotent.
//   - Indices with no existing edit: cleanup edit added.

export function mergeCleanupIntoOverrides(
  existing:    WordOverrides,
  cleanupEdits: WordEdit[],
): WordOverrides {
  const lockedSet = new Set(existing.locks);
  const editsByIndex = new Map<number, WordEdit>();

  // Seed with existing edits
  for (const e of existing.edits) editsByIndex.set(e.wordIndex, e);

  // Apply cleanup edits, skipping locked indices.
  for (const e of cleanupEdits) {
    if (lockedSet.has(e.wordIndex)) continue;
    editsByIndex.set(e.wordIndex, e);
  }

  const merged = Array.from(editsByIndex.values())
    .sort((a, b) => a.wordIndex - b.wordIndex);

  return { edits: merged, locks: [...existing.locks] };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function normalizeForCompare(s: string): string {
  // Lowercase, strip everything that isn't a letter or digit (punctuation,
  // whitespace within "GraphQL" anchors stays in the canonical when we treat
  // multi-token anchors — but for compare we strip).
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}