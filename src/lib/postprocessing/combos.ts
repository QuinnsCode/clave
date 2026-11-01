// src/lib/postprocessing/combos.ts
//
// Combo presets — the "menu" callers pick from.
//
// Each combo defines a per-step RunMode. The harness merges these with
// step defaults + caller overrides at execution time.

import type { Combo, RunMode, StepName } from "./types";

type ComboSpec = Record<StepName, RunMode>;

export const COMBOS: Record<Combo, ComboSpec> = {
  // Nothing runs. Used when caller just wants artifact awareness without
  // touching any pipeline state.
  none: {
    assemble: "skip",
    waveform: "skip",
    diarize:  "skip",
    cleanup:  "skip",
    timeline: "skip",
  },

  // Just clean the audio. No transcription, no visual artifacts.
  minimal: {
    assemble: "auto",
    waveform: "skip",
    diarize:  "skip",
    cleanup:  "skip",
    timeline: "skip",
  },

  // Audio + diarization, no visual artifacts. Cleanup still runs if pod
  // anchors exist — transcripts benefit even without the timeline view.
  transcribed: {
    assemble: "auto",
    waveform: "skip",
    diarize:  "auto",
    cleanup:  "auto",
    timeline: "skip",
  },

  // Today's "full" — everything the drawer needs.
  diarized: {
    assemble: "auto",
    waveform: "auto",
    diarize:  "auto",
    cleanup:  "auto",
    timeline: "auto",
  },

  // Everything we have. Currently same as "diarized" — left as a separate
  // combo so future steps (summary, sentiment, etc) join here.
  "animal-style": {
    assemble: "auto",
    waveform: "auto",
    diarize:  "auto",
    cleanup:  "auto",
    timeline: "auto",
  },

  // Backfill waveform + timeline for a session missing them.
  "regen-waveform": {
    assemble: "skip",
    waveform: "force",
    diarize:  "skip",
    cleanup:  "skip",   // cleanup is orthogonal to waveform — don't touch
    timeline: "force",
  },

  // Just re-run timeline.
  "regen-timeline": {
    assemble: "skip",
    waveform: "skip",
    diarize:  "skip",
    cleanup:  "skip",
    timeline: "force",
  },

  // Re-run cleanup against current pod anchors. Useful after the user adds
  // anchors to a pod — they probably want to retroactively clean up
  // existing transcripts.
  "regen-cleanup": {
    assemble: "skip",
    waveform: "skip",
    diarize:  "skip",
    cleanup:  "force",
    timeline: "skip",   // timeline doesn't depend on cleanup; overrides
                        // apply at read time via getSessionDiarization
  },
};

// ── Resolve a combo to step RunModes ───────────────────────────────────────

export function resolveComboModes(combo: Combo | undefined): ComboSpec {
  if (!combo) return COMBOS.diarized;
  return COMBOS[combo] ?? COMBOS.diarized;
}

// ── Override merge ─────────────────────────────────────────────────────────

export function mergeStepModes(
  combo:     Combo | undefined,
  overrides: Partial<Record<StepName, { mode?: RunMode }>> | undefined,
): ComboSpec {
  const base = resolveComboModes(combo);
  if (!overrides) return base;

  const merged: ComboSpec = { ...base };
  for (const step of Object.keys(merged) as StepName[]) {
    const override = overrides[step]?.mode;
    if (override) merged[step] = override;
  }
  return merged;
}

// ── Pre-flight validation ──────────────────────────────────────────────────

export interface ValidationIssue {
  step:   StepName;
  kind:   "missing-dependency" | "impossible-state";
  reason: string;
}

export function validateModes(
  modes:    ComboSpec,
  existing: {
    audio:       { exists: boolean };
    waveform:    { exists: boolean };
    diarization: { exists: boolean };
    cleanup:     { exists: boolean };
    timeline:    { exists: boolean };
  },
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // diarize needs audio
  if (modes.diarize !== "skip" && !existing.audio.exists && modes.assemble === "skip") {
    issues.push({
      step:   "diarize",
      kind:   "missing-dependency",
      reason: "diarize needs audio.webm but assemble is skipped and audio doesn't exist",
    });
  }

  // waveform needs audio
  if (modes.waveform !== "skip" && !existing.audio.exists && modes.assemble === "skip") {
    issues.push({
      step:   "waveform",
      kind:   "missing-dependency",
      reason: "waveform needs audio.webm but assemble is skipped and audio doesn't exist",
    });
  }

  // cleanup needs diarization (will be there if diarize runs OR already exists)
  if (modes.cleanup !== "skip") {
    const willHaveDiar = existing.diarization.exists || modes.diarize !== "skip";
    if (!willHaveDiar) {
      issues.push({
        step:   "cleanup",
        kind:   "missing-dependency",
        reason: "cleanup needs diarization but diarize is skipped and diarization doesn't exist",
      });
    }
  }

  // timeline needs diarization + waveform
  if (modes.timeline !== "skip") {
    const willHaveDiar = existing.diarization.exists || modes.diarize !== "skip";
    const willHaveWave = existing.waveform.exists || modes.waveform !== "skip";
    if (!willHaveDiar) {
      issues.push({
        step:   "timeline",
        kind:   "missing-dependency",
        reason: "timeline needs diarization but diarize is skipped and diarization doesn't exist",
      });
    }
    if (!willHaveWave) {
      issues.push({
        step:   "timeline",
        kind:   "missing-dependency",
        reason: "timeline needs waveform but waveform is skipped and waveform doesn't exist",
      });
    }
  }

  return issues;
}