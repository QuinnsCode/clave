// src/lib/postprocessing/runPipeline.ts
//
// THE HARNESS. Pure mechanics — no auth, no quotas, no tier checks.
// Server actions wrap this and enforce entitlements above.
//
// EXECUTION:
//   1. Resolve combo → per-step run modes (combos.ts)
//   2. Apply caller overrides (PipelineArgs.steps)
//   3. Load current artifact state from D1 (so we know what's missing)
//   4. Validate the merged config can actually execute given current state
//   5. Upsert the SessionDiarization row (status: "running")
//   6. Walk steps in dependency order
//        For each: skip if mode === "skip" OR (mode === "auto" + exists)
//                  else call step.run(opts, ctx)
//   7. Patch the SessionDiarization row with per-step results
//   8. Return PipelineResult
//
// FAILURE HANDLING:
//   Steps return { status: "failed", reason } — they don't throw.
//   A failed step doesn't crash the harness, but it can block downstream
//   steps (e.g. timeline can't run if diarize failed). Downstream steps
//   inherit the failure via the existing-snapshot check.

import { db } from "@/db";
import type {
  PipelineArgs,
  PipelineResult,
  PipelineIds,
  StepName,
  StepResult,
  StepRunContext,
  StepArtifactSnapshot,
  Combo,
  DiarizeOpts,
} from "./types";
import {
  mergeStepModes,
  validateModes,
} from "./combos";
import { getStep, STEPS } from "./steps";

// ── Env shape ──────────────────────────────────────────────────────────────
// Narrow type covering all bindings the harness + any step might need.
// Each step picks just what it uses.

export interface PostProcessingEnv {
  RECORDING_BUCKET:  R2Bucket;
  DIARIZE_CONTAINER: DurableObjectNamespace;
  // Diarization provider factory inputs:
  AI?:                   any;
  TRANSCRIPTION_AI?:     any;
  DIARIZATION_PROVIDER?: string;
  XAI_API_KEY?:          string;
  DEEPGRAM_API_KEY?:     string;
}

// ── Main ───────────────────────────────────────────────────────────────────

export async function runPipeline(
  env:  PostProcessingEnv,
  args: PipelineArgs,
): Promise<PipelineResult> {
  const startedAt = Date.now();
  const { ids, triggeredBy } = args;
  const combo: Combo = args.combo ?? "diarized";

  // ── Phase 1: Resolve modes ───────────────────────────────────────────────
  // Combo provides defaults; caller overrides win on `mode`.
  const modes = mergeStepModes(combo, args.steps);

  // ── Phase 1b: Resolve tag for this run ───────────────────────────────────
  // Tag goes onto the SessionDiarization row + into R2 paths for diarization
  // and timeline. Default comes from the diarize step's defaults; caller can
  // override via args.steps.diarize.tag.
  const tag = resolveTag(env, args);

  // ── Phase 2: Load current artifact state ─────────────────────────────────
  // We need this to (a) validate the modes, (b) decide skip-if-exists in
  // each step's "auto" mode, and (c) populate the StepRunContext.
  const existing: StepArtifactSnapshot = await loadArtifactSnapshot(ids, tag);

  // ── Phase 3: Validate ────────────────────────────────────────────────────
  // Catch impossible configurations before we touch state.
  const issues = validateModes(modes, existing);
  if (issues.length > 0) {
    const reason = issues.map(i => `${i.step}: ${i.reason}`).join("; ");
    throw new Error(`pipeline config invalid: ${reason}`);
  }

  // ── Phase 4: Upsert SessionDiarization row ──────────────────────────────
  // One row per (sessionId, peerId, tag). Status: "running" while in flight.
  const provider = resolveProviderName(env, args);
  const diarizationId = await upsertRunningRow({
    ids,
    triggeredBy,
    tag,
    provider,
    providerOpts: args.steps?.diarize?.opts ?? {},
  });

  // ── Phase 5: Execute steps in dependency order ──────────────────────────
  // Hardcoded order today (matches dependsOn declarations on each step):
  //   assemble → waveform → diarize → cleanup → timeline       // CHANGED (cleanup pass) — cleanup inserted between diarize and timeline
  //
  // Cleanup runs after diarize so it can read the in-memory words[] without
  // re-fetching from R2. Timeline runs after cleanup but doesn't depend on
  // it — overrides apply at read time via getSessionDiarization.
  //
  // If we add steps with non-trivial dependency graphs later, replace this
  // with a topological sort over STEPS[*].dependsOn.
  const executionOrder: StepName[] = ["assemble", "waveform", "diarize", "cleanup", "timeline"];   // CHANGED (cleanup pass)

  const inMemoryArtifacts = new Map<StepName, unknown>();
  const results: StepResult[] = [];
  let runningExisting = existing;

  for (const stepName of executionOrder) {
    const mode = modes[stepName];

    // ── Explicit skip ────────────────────────────────────────────────────
    if (mode === "skip") {
      results.push({
        step:       stepName,
        status:     "skipped",
        reason:     "explicit-skip",
        durationMs: 0,
      });
      continue;
    }

    // ── Auto-skip (artifact already exists) ──────────────────────────────
    if (mode === "auto" && artifactExists(stepName, runningExisting)) {
      results.push({
        step:       stepName,
        status:     "skipped",
        reason:     "artifact-exists",
        durationMs: 0,
      });
      continue;
    }

    // ── Dep-failed guard ─────────────────────────────────────────────────
    // If a previous step we depend on failed, skip this one with a clear
    // reason instead of running and producing confusing errors.
    const depFailure = checkDepFailure(stepName, results);
    if (depFailure) {
      results.push({
        step:       stepName,
        status:     "skipped",
        reason:     `dep-failed:${depFailure}`,
        durationMs: 0,
      });
      continue;
    }

    // ── Build opts ───────────────────────────────────────────────────────
    // Step's own defaults + caller overrides + tag injected for steps that
    // need it (diarize, cleanup, timeline write to tagged R2 paths).
    const opts = buildStepOpts(stepName, env, ids, args, tag);

    // ── Run the step ─────────────────────────────────────────────────────
    const ctx: StepRunContext = {
      env,
      ids,
      existing: runningExisting,
      triggeredBy,
      inMemoryArtifacts,
    };

    const step = getStep(stepName);
    const result = await step.run(opts as any, ctx);

    results.push(result);

    // ── Persist + update running snapshot ────────────────────────────────
    await patchStepResult(diarizationId, result);
    runningExisting = applyResultToSnapshot(runningExisting, result);
  }

  // ── Phase 6: Final row update ───────────────────────────────────────────
  // Top-level status = failed if ANY step ran and failed. Skipped steps
  // don't count as failures.
  const anyRanAndFailed = results.some(r => r.status === "failed");
  const ok = !anyRanAndFailed;
  await finalizeRow(diarizationId, ok, results);

  return {
    ok,
    diarizationId,
    ids,
    combo,
    steps:   results,
    totalMs: Date.now() - startedAt,
  };
}

// ── Tag + provider resolution ──────────────────────────────────────────────
// Diarize step's tag and provider come from (in order):
//   1. args.steps.diarize.tag / .provider
//   2. The diarize step's defaultOpts() (which reads env)
// We resolve them here once so the D1 upsert and step opts agree.

function resolveTag(env: PostProcessingEnv, args: PipelineArgs): string {
  const override = args.steps?.diarize?.tag;
  if (typeof override === "string" && override.length > 0) return override;
  const defaults = STEPS.diarize.defaultOpts(env, args.ids);
  return defaults.tag ?? "nova3";
}

function resolveProviderName(env: PostProcessingEnv, args: PipelineArgs): string {
  const override = args.steps?.diarize?.provider;
  if (typeof override === "string" && override.length > 0) return override;
  const defaults = STEPS.diarize.defaultOpts(env, args.ids);
  return defaults.provider ?? "workers-ai-nova3";
}

// ── D1 helpers ──────────────────────────────────────────────────────────────

async function loadArtifactSnapshot(
  ids: PipelineIds,
  tag: string,
): Promise<StepArtifactSnapshot> {
  // Look up the row for this (session, peer, tag) — there's at most one
  // post the unique constraint (when we add it). Today there could be
  // multiple rows from legacy dupes; we just pick the latest.
  const row = await db.sessionDiarization.findFirst({
    where: {
      sessionId: ids.sessionId,
      peerId:    ids.peerId,
      tag,
    },
    orderBy: { createdAt: "desc" },
  });

  if (!row) {
    return emptySnapshot();
  }

  return {
    audio: {
      exists: row.audioStatus === "done" && !!row.audioKey,
      key:    row.audioKey,
      bytes:  row.audioBytes,
    },
    waveform: {
      exists: row.waveformStatus === "done" && !!row.waveformKey,
      key:    row.waveformKey,
      bytes:  row.waveformBytes,
    },
    diarization: {
      exists: row.diarizationStatus === "done" && !!row.diarizationKey,
      key:    row.diarizationKey,
      bytes:  row.diarizationBytes,
    },
    // NEW (cleanup pass) — uses cleanup_* fields added in migration 0027.
    // Cast through `any` because the generated Prisma client may not include
    // these fields if `prisma generate` hasn't been re-run after the
    // migration — surface a runtime read on `undefined` instead of a compile
    // break. Drop the cast once the client knows about the fields.
    cleanup: {
      exists: (row as any).cleanupStatus === "done" && !!(row as any).cleanupKey,
      key:    (row as any).cleanupKey   ?? null,
      bytes:  (row as any).cleanupBytes ?? null,
    },
    timeline: {
      exists: row.timelineStatus === "done" && !!row.timelineKey,
      key:    row.timelineKey,
      bytes:  row.timelineBytes,
    },
  };
}

function emptySnapshot(): StepArtifactSnapshot {
  const empty = { exists: false, key: null, bytes: null };
  return {
    audio:       { ...empty },
    waveform:    { ...empty },
    diarization: { ...empty },
    cleanup:     { ...empty },   // NEW (cleanup pass)
    timeline:    { ...empty },
  };
}

async function upsertRunningRow(args: {
  ids: PipelineIds;
  triggeredBy: string;
  tag: string;
  provider: string;
  providerOpts: unknown;
}): Promise<string> {
  const { ids, triggeredBy, tag, provider, providerOpts } = args;

  // Find existing row for this (session, peer, tag).
  const existing = await db.sessionDiarization.findFirst({
    where: {
      sessionId: ids.sessionId,
      peerId:    ids.peerId,
      tag,
    },
    select: { id: true, attempts: true },
  });

  if (existing) {
    await db.sessionDiarization.update({
      where: { id: existing.id },
      data: {
        status:       "running",
        attempts:     { increment: 1 },
        triggeredBy,
        providerOpts: JSON.stringify(providerOpts),
        provider,
        startedAt:    new Date(),
        completedAt:  null,
        error:        null,
      },
    });
    return existing.id;
  }

  const created = await db.sessionDiarization.create({
    data: {
      organizationId: ids.organizationId,
      siteKey:        ids.siteKey,
      sessionId:      ids.sessionId,
      peerId:         ids.peerId,
      provider,
      tag,
      providerOpts:   JSON.stringify(providerOpts),
      status:         "running",
      attempts:       1,
      triggeredBy,
      startedAt:      new Date(),
    },
    select: { id: true },
  });
  return created.id;
}

function buildStepOpts(
  stepName: StepName,
  env: PostProcessingEnv,
  ids: PipelineIds,
  args: PipelineArgs,
  tag: string,
): unknown {
  const step = getStep(stepName);
  const defaults = step.defaultOpts(env, ids);
  const override = (args.steps as any)?.[stepName] ?? {};

  // For diarize: inject resolved tag/provider on top so step doesn't have
  // to re-resolve. Same for any future step that needs the tag.
  if (stepName === "diarize") {
    return { ...defaults, ...override, tag, provider: resolveProviderName(env, args) };
  }
  // NEW (cleanup pass) — cleanup also needs the tag (reads diarization-{tag}.json
  // input + writes cleanup-{tag}.json output). Same pattern as timeline.
  if (stepName === "cleanup") {
    return { ...defaults, ...override, tag };
  }
  if (stepName === "timeline") {
    // Timeline needs the tag to know which diarization JSON to read +
    // which timeline path to write.
    return { ...defaults, ...override, tag };
  }
  return { ...defaults, ...override };
}

async function patchStepResult(
  diarizationId: string,
  result: StepResult,
): Promise<void> {
  // Map step name → which columns to patch. Same set of fields per step
  // (key, bytes, status, error, generatedAt), just different prefixes.
  const patch: Record<string, unknown> = {};

  const setIf = (prefix: string) => {
    patch[`${prefix}Status`]      = result.status;
    patch[`${prefix}Error`]       = result.status === "failed" ? (result.reason ?? null) : null;
    patch[`${prefix}GeneratedAt`] = result.status === "done"   ? new Date() : null;
    if (result.status === "done") {
      patch[`${prefix}Key`]   = result.artifactKey   ?? null;
      patch[`${prefix}Bytes`] = result.artifactBytes ?? null;
    }
  };

  switch (result.step) {
    case "assemble": setIf("audio");       break;
    case "waveform": setIf("waveform");    break;
    case "diarize":  setIf("diarization"); break;
    case "cleanup":  setIf("cleanup");     break;   // NEW (cleanup pass)
    case "timeline": setIf("timeline");    break;
  }

  // Special handling for diarize — also update the slim queryable fields.
  if (result.step === "diarize" && result.status === "done" && result.extras) {
    const e = result.extras as Record<string, unknown>;
    if (typeof e.wordCount    === "number") patch.wordCount    = e.wordCount;
    if (typeof e.speakerCount === "number") patch.speakerCount = e.speakerCount;
    if (typeof e.durationSec  === "number") patch.durationSec  = e.durationSec;
    if (typeof e.transcript   === "string") patch.transcript   = e.transcript;
    if (typeof e.result       === "string") patch.result       = e.result;
  }

  // Waveform extras carry pps.
  if (result.step === "waveform" && result.status === "done" && result.extras) {
    const e = result.extras as Record<string, unknown>;
    if (typeof e.pps === "string") patch.waveformPps = e.pps;
  }

  // Assemble step can produce a waveform side-effect — record it too.
  if (result.step === "assemble" && result.status === "done" && result.extras) {
    const e = result.extras as Record<string, unknown>;
    if (typeof e.waveformKey === "string") {
      patch.waveformKey         = e.waveformKey;
      patch.waveformBytes       = typeof e.waveformBytes === "number" ? e.waveformBytes : null;
      patch.waveformPps         = typeof e.waveformPps   === "string" ? e.waveformPps   : null;
      patch.waveformStatus      = "done";
      patch.waveformGeneratedAt = new Date();
      patch.waveformError       = null;
    }
  }

  // NEW (cleanup pass) — cleanup writes its merged wordOverrides directly
  // to D1 from inside the step (see steps/cleanup.ts step 7), since
  // wordOverrides isn't a *Status field and doesn't follow the per-step
  // pattern above. Cleanup extras (editsApplied, anchorsMatched, etc) are
  // diagnostic-only and live in the R2 audit artifact, not D1.

  await db.sessionDiarization.update({
    where: { id: diarizationId },
    data:  patch,
  });
}

async function finalizeRow(
  id: string,
  ok: boolean,
  results: StepResult[],
): Promise<void> {
  // Build a top-level error summary from failed steps.
  const failures = results.filter(r => r.status === "failed");
  const errorMsg = failures.length > 0
    ? failures.map(f => `${f.step}: ${f.reason ?? "unknown"}`).join("; ").slice(0, 2000)
    : null;

  await db.sessionDiarization.update({
    where: { id },
    data: {
      status:      ok ? "done" : "failed",
      error:       errorMsg,
      completedAt: new Date(),
    },
  });
}

// ── Step helpers ────────────────────────────────────────────────────────────

function artifactExists(stepName: StepName, snapshot: StepArtifactSnapshot): boolean {
  switch (stepName) {
    case "assemble": return snapshot.audio.exists;
    case "waveform": return snapshot.waveform.exists;
    case "diarize":  return snapshot.diarization.exists;
    case "cleanup":  return snapshot.cleanup.exists;   // NEW (cleanup pass)
    case "timeline": return snapshot.timeline.exists;
  }
}

function checkDepFailure(stepName: StepName, results: StepResult[]): string | null {
  // Find the step entry. If any of its deps failed in this run, return
  // the failed dep's name.
  const step = getStep(stepName);
  for (const depName of step.dependsOn) {
    const depResult = results.find(r => r.step === depName);
    if (depResult?.status === "failed") return depName;
  }
  return null;
}

function applyResultToSnapshot(
  snapshot: StepArtifactSnapshot,
  result: StepResult,
): StepArtifactSnapshot {
  if (result.status !== "done" || !result.artifactKey) return snapshot;

  const next = { ...snapshot };
  const artifactInfo = {
    exists: true,
    key:    result.artifactKey,
    bytes:  result.artifactBytes ?? null,
  };
  switch (result.step) {
    case "assemble": {
      next.audio = artifactInfo;
      // If assemble also produced a waveform side-effect, surface it.
      const wfKey = (result.extras as any)?.waveformKey;
      if (typeof wfKey === "string") {
        next.waveform = {
          exists: true,
          key:    wfKey,
          bytes:  (result.extras as any)?.waveformBytes ?? null,
        };
      }
      break;
    }
    case "waveform": next.waveform    = artifactInfo; break;
    case "diarize":  next.diarization = artifactInfo; break;
    case "cleanup":  next.cleanup     = artifactInfo; break;   // NEW (cleanup pass)
    case "timeline": next.timeline    = artifactInfo; break;
  }
  return next;
}