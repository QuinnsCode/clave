"use server";
// src/app/serverActions/diarization/saveWordOverride.ts
//
// Two server actions for the per-word edit/lock UI:
//   - saveWordEdit(diarizationId, wordIndex, text)
//       Stores/replaces an edit entry. Also captures the original text from
//       the diarization's words[] so we can show "was: cutely" in the UI
//       later, and so the changelog has the data when we add history view.
//   - toggleWordLock(diarizationId, wordIndex)
//       Adds or removes the index from the locks[] array.
//
// Auth: caller must pass the userId/orgId that owns this diarization. We
// verify the diarization belongs to the claimed org before writing —
// defense-in-depth against cross-tenant writes even if the route handler
// somehow skipped auth.
//
// Storage: SessionDiarization.wordOverrides is a JSON column we read,
// mutate, and write back. Last-write-wins; no concurrency control (the
// edit UI is single-user and edits are idempotent on the same word).
//
// We bump SessionDiarization.completedAt? No — that's job state, not edit
// state. Leave it alone.

import { db } from "@/db";
import {
  parseWordOverrides,
  type WordOverrides,
  type WordEdit,
  type DiarizedWord,
} from "@/lib/diarization/utterances";

interface AuthArgs {
  userId:         string;
  organizationId: string;
}

interface SaveWordEditArgs extends AuthArgs {
  diarizationId: string;
  wordIndex:     number;
  text:          string;          // new text. Empty string allowed → effectively a deletion edit.
}

interface ToggleWordLockArgs extends AuthArgs {
  diarizationId: string;
  wordIndex:     number;
}

interface MutationResult {
  ok:        boolean;
  overrides?: WordOverrides;
  error?:    string;
}

// ── saveWordEdit ────────────────────────────────────────────────────────────

export async function saveWordEdit(args: SaveWordEditArgs): Promise<MutationResult> {
  const { diarizationId, wordIndex, text, organizationId } = args;
  if (!diarizationId || wordIndex < 0) {
    return { ok: false, error: "missing required field" };
  }

  // Load the diarization row. We need:
  //   - wordOverrides current value (to merge into)
  //   - result.words (to read the original text for the changelog)
  //   - organizationId (to verify auth)
  const row = await db.sessionDiarization.findUnique({
    where: { id: diarizationId },
    select: { organizationId: true, result: true, wordOverrides: true },
  });
  if (!row) return { ok: false, error: "diarization not found" };
  if (row.organizationId !== organizationId) {
    return { ok: false, error: "wrong organization" };
  }

  // Resolve original text from result.words if available — purely for the
  // changelog. If something's malformed, we still let the edit through with
  // empty original.
  let original = "";
  try {
    const parsedResult = row.result ? JSON.parse(row.result) : null;
    const words: DiarizedWord[] = parsedResult?.words ?? [];
    if (wordIndex < words.length) original = words[wordIndex]?.text ?? "";
  } catch {
    // result missing/malformed — proceed without original. Edit still works.
  }

  // Mutate overrides: replace or append edit at this wordIndex.
  const overrides = parseWordOverrides(row.wordOverrides);
  const newEdit: WordEdit = {
    wordIndex,
    original,
    text,
    at: new Date().toISOString(),
  };
  const otherEdits = overrides.edits.filter(e => e.wordIndex !== wordIndex);
  const nextOverrides: WordOverrides = {
    edits: [...otherEdits, newEdit].sort((a, b) => a.wordIndex - b.wordIndex),
    locks: overrides.locks,
  };

  await db.sessionDiarization.update({
    where: { id: diarizationId },
    data:  { wordOverrides: JSON.stringify(nextOverrides) },
  });

  return { ok: true, overrides: nextOverrides };
}

// ── toggleWordLock ──────────────────────────────────────────────────────────

export async function toggleWordLock(args: ToggleWordLockArgs): Promise<MutationResult> {
  const { diarizationId, wordIndex, organizationId } = args;
  if (!diarizationId || wordIndex < 0) {
    return { ok: false, error: "missing required field" };
  }

  const row = await db.sessionDiarization.findUnique({
    where: { id: diarizationId },
    select: { organizationId: true, wordOverrides: true },
  });
  if (!row) return { ok: false, error: "diarization not found" };
  if (row.organizationId !== organizationId) {
    return { ok: false, error: "wrong organization" };
  }

  const overrides = parseWordOverrides(row.wordOverrides);
  const locked    = overrides.locks.includes(wordIndex);

  const nextOverrides: WordOverrides = {
    edits: overrides.edits,
    locks: locked
      ? overrides.locks.filter(i => i !== wordIndex)        // unlock
      : [...overrides.locks, wordIndex].sort((a, b) => a - b),  // lock
  };

  await db.sessionDiarization.update({
    where: { id: diarizationId },
    data:  { wordOverrides: JSON.stringify(nextOverrides) },
  });

  return { ok: true, overrides: nextOverrides };
}