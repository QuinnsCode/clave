// src/lib/postprocessing/types.ts
//
// Shared types for the post-processing harness.
//
// MENTAL MODEL — fast-food menu:
//   - Ingredients (StepName)  = individual processing steps
//   - Combos     (Combo)      = named presets that bundle steps
//   - Run modes  (RunMode)    = auto/force/skip per step
//   - Custom orders            = combo + caller overrides per step
//
// The harness is pure mechanics. It doesn't know about tiers, auth, or
// quotas. Server actions wrap it and enforce entitlements above.
//
// EXTENSIBILITY:
//   To add a new step (e.g. "summary"):
//     1. Add to StepName union below
//     2. Create steps/summary.ts conforming to the Step interface
//     3. Add to one or more combos in combos.ts
//   No changes to runPipeline.ts required — it reads from a registry.

import type { DiarizationOpts, ProviderName } from "@/lib/diarization/types";

// ── Identity ────────────────────────────────────────────────────────────────
// Every harness call operates on one (session, peer) pair within an org.
// All four IDs come from the caller — harness doesn't infer or look them up.

export interface PipelineIds {
  organizationId: string;
  siteKey:        string;
  sessionId:      string;
  peerId:         string;
}

// ── Steps (ingredients) ─────────────────────────────────────────────────────
// One entry per atomic processing operation. Order in this union doesn't
// imply execution order — that's declared per-step via `dependsOn`.

export type StepName =
  | "assemble"   // chunks → audio.webm (+ waveform.dat as side effect today)
  | "waveform"   // audio.webm → waveform.dat (regen path, no audio re-encode)
  | "diarize"    // audio.webm → diarization.json (per-provider, tagged)
  | "cleanup"    // NEW (cleanup pass) — pod anchors + diarization → wordOverrides + audit JSON
  | "timeline";  // diarization.json + waveform.dat → timeline.json (pure compute)

// ── Run modes ───────────────────────────────────────────────────────────────
// Per-step toggle that decides what the harness does.
//
// "auto"  — run only if the output artifact is missing. Skip otherwise.
//           Cheapest correct behavior. Most callers use this.
// "force" — run regardless of existing artifact. Overwrites. Use for regen.
// "skip"  — never run, even if missing. Use to explicitly opt out.

export type RunMode = "auto" | "force" | "skip";

// ── Combos (the menu) ───────────────────────────────────────────────────────
// Named presets that map to a full step config. Defined in combos.ts so
// new combos can be added without touching this file.
//
// String literal union for type-safety in TIER_COMBOS, server actions, UI.

export type Combo =
  | "none"             // touch nothing, just return artifact awareness
  | "minimal"          // assemble only (clean the audio, nothing else)
  | "transcribed"      // assemble + diarize (no waveform, no timeline)
  | "diarized"         // assemble + waveform + diarize + cleanup + timeline (today's "full")
  | "animal-style"     // everything we have (currently same as diarized;
                       // future-proofed for when summary/sentiment/etc land)
  | "regen-waveform"   // force waveform + timeline for an audio+diar session
                       // (used to backfill sessions that pre-date the PPS fix)
  | "regen-timeline"   // force timeline only (cheap recompute)
  | "regen-cleanup";   // NEW (cleanup pass) — re-run cleanup against current
                       // pod anchors. Cheap; useful after the user adds/edits
                       // anchors and wants existing transcripts re-corrected.

// ── Step opts ───────────────────────────────────────────────────────────────
// Each step gets a `mode` + step-specific opts. Steps that don't need extra
// opts just use { mode }. Opt shapes are forward-extensible — new fields
// added later are nullable.

export interface StepOptsBase {
  mode: RunMode;
}

export interface AssembleOpts extends StepOptsBase {
  // No step-specific opts today. Container is the source of truth for how
  // chunks are concatenated + re-encoded. If we ever want per-call control
  // (e.g. bitrate, codec), add fields here.
}

export interface WaveformOpts extends StepOptsBase {
  // Bucket resolution. Container currently hardcodes pixelsPerSecond=1
  // and the field is mostly informational. Leave room for caller override
  // if we ever do per-session zoom levels.
  pixelsPerSecond?: string;
}

export interface DiarizeOpts extends StepOptsBase {
  // Which provider to use for this run. Defaults to env.DIARIZATION_PROVIDER
  // resolved by getDiarizationProvider(). Override here to A/B test or to
  // force a specific provider (e.g. "grok" for a re-run with a stronger
  // entity model).
  provider?: ProviderName;

  // Display/path tag. Goes into the R2 key: diarization-{tag}.json. Defaults
  // to a sensible string derived from provider ("workers-ai-nova3" → "nova3").
  // Use a custom tag for variant runs ("nova3-v2", "nova3+grok-merged").
  tag?: string;

  // Cross-provider opts (language, vocabulary, providerOpts). Passed through
  // to the diarization provider verbatim. See DiarizationOpts type.
  opts?: DiarizationOpts;
}

// NEW (cleanup pass) ─────────────────────────────────────────────────────────
// Cleanup reads pod anchors + diarization words, runs fuzzy match against
// each, and writes edits into wordOverrides. The R2 audit artifact records
// what got considered and what got applied (for diagnostics + future tuning).

export interface CleanupOpts extends StepOptsBase {
  // Score threshold for an edit to be applied. Below this, the candidate
  // shows up in the audit but doesn't change wordOverrides. Default 0.7.
  // Lower = more aggressive (more candidates promoted to edits).
  threshold?: number;

  // Floor for Levenshtein similarity before a candidate is considered at
  // all. Default 0.55. Tighter than threshold — keeps the candidate list
  // from including obvious non-matches.
  minLevSim?: number;

  // Which diarization tag's data to base cleanup on. Read from
  // diarization-{tag}.json on R2, written to cleanup-{tag}.json. Default
  // matches the diarize step's tag.
  tag?: string;
}

export interface TimelineOpts extends StepOptsBase {
  // Pure compute — no step opts today. Reads from existing artifacts.

  // Tag injected by the harness so timeline reads the right diarization
  // and writes the matching timeline path.
  tag?: string;
}

// Convenience: a partial step config per step name. Used for caller overrides
// on top of combos.

export interface StepsConfig {
  assemble?: Partial<AssembleOpts>;
  waveform?: Partial<WaveformOpts>;
  diarize?:  Partial<DiarizeOpts>;
  cleanup?:  Partial<CleanupOpts>;   // NEW (cleanup pass)
  timeline?: Partial<TimelineOpts>;
}

// ── Pipeline call shape ─────────────────────────────────────────────────────
// What runPipeline() takes as input.
//
// EITHER combo is specified (preset) OR steps is fully specified (custom).
// If both, combo provides defaults and steps overrides specific fields.
// If neither, defaults to combo: "diarized" (the previous default behavior
// from runPostProcessing).

export interface PipelineArgs {
  ids: PipelineIds;

  // Choose a combo (preset) OR override per-step OR both.
  combo?: Combo;
  steps?: StepsConfig;

  // Audit trail — goes onto the SessionDiarization row.
  triggeredBy: string;  // "manual:curl" | userId | "queue:auto" | "regen:user"
}

// ── Per-step result ─────────────────────────────────────────────────────────
// Every step run returns this shape. Harness collects them into PipelineResult.

export interface StepResult {
  step:   StepName;

  // What happened.
  status: "done" | "failed" | "skipped";

  // For "skipped": why. "artifact-exists" | "explicit-skip" | "deps-missing"
  // For "failed":  error message.
  reason?: string;

  // Output artifact info (set when status === "done").
  artifactKey?:         string;       // R2 key written
  artifactBytes?:       number;
  artifactGeneratedAt?: Date;

  // Step-specific extras for downstream steps. Timeline reads diarization's
  // word array out of this on the same call; avoids a re-fetch from R2.
  // Keep loose — different steps surface different things.
  extras?: Record<string, unknown>;

  // Timings (ms).
  durationMs: number;
}

// ── Pipeline result ─────────────────────────────────────────────────────────
// What runPipeline() returns. Combines per-step results + overall metadata.

export interface PipelineResult {
  ok:            boolean;        // false if any required step failed
  diarizationId: string;          // SessionDiarization row id (created or updated)
  ids:           PipelineIds;
  combo:         Combo;           // resolved combo (default if not specified)

  // Ordered by execution order. Length matches number of steps the combo
  // selected (not all five — skipped steps still appear here with
  // status: "skipped").
  steps: StepResult[];

  // Top-level timings.
  totalMs: number;
}

// ── Step interface (the seam for adding new steps) ──────────────────────────
// Every step file exports an object conforming to this. Harness imports
// from a registry (steps/index.ts) and walks them in dependency order.
//
// `existing` is the current artifact state from D1 — lets a step decide if
// it should run (mode === "auto" + artifact exists → skip).

export interface StepArtifactSnapshot {
  // What's currently in D1 for this (session, peer, tag). Populated before
  // any step runs by getSessionArtifacts(). Steps read this to decide
  // skip-if-exists behavior.
  audio:       { exists: boolean; key: string | null; bytes: number | null };
  waveform:    { exists: boolean; key: string | null; bytes: number | null };
  diarization: { exists: boolean; key: string | null; bytes: number | null };
  cleanup:     { exists: boolean; key: string | null; bytes: number | null };   // NEW (cleanup pass)
  timeline:    { exists: boolean; key: string | null; bytes: number | null };
}

export interface StepRunContext {
  env: any;                          // PostProcessingEnv from runPipeline.ts
  ids: PipelineIds;
  existing: StepArtifactSnapshot;    // Current state of all artifacts
  triggeredBy: string;

  // Output buffer — steps can stash artifact bytes here to pass to later
  // steps without re-reading from R2. Timeline uses this to read the
  // freshly-produced waveform/diarization without a round-trip. Cleanup
  // reads the just-run diarize step's words[] out of here.
  inMemoryArtifacts: Map<StepName, unknown>;
}

export interface Step<Opts extends StepOptsBase> {
  /** Stable identifier matching the StepName union. */
  readonly name: StepName;

  /** Other steps that must complete before this one. Used for topo sort. */
  readonly dependsOn: readonly StepName[];

  /**
   * Build default opts for this step from env + ids. Caller overrides via
   * StepsConfig get merged on top.
   * Pure — must not read R2 or DB. Use the context for that inside run().
   */
  defaultOpts(env: any, ids: PipelineIds): Opts;

  /**
   * Execute the step. Returns a StepResult that the harness records in D1.
   * Should NOT throw — return { status: "failed", reason } instead so the
   * harness can continue (or stop, depending on dependsOn).
   */
  run(opts: Opts, ctx: StepRunContext): Promise<StepResult>;
}

// ── Type narrowing helpers ──────────────────────────────────────────────────
// For places that need to dispatch by step name (e.g. the harness loop).

export type AnyStepOpts =
  | AssembleOpts
  | WaveformOpts
  | DiarizeOpts
  | CleanupOpts        // NEW (cleanup pass)
  | TimelineOpts;

export interface StepOptsByName {
  assemble: AssembleOpts;
  waveform: WaveformOpts;
  diarize:  DiarizeOpts;
  cleanup:  CleanupOpts;     // NEW (cleanup pass)
  timeline: TimelineOpts;
}