// src/lib/postprocessing/steps/cleanup.ts
//
// STEP: cleanup
// INPUT:  diarization (from in-memory just-ran result OR R2 diarization.json)
//         + pod anchors (from D1 via QlaveSessionLog → Pod → PodAnchor[])
// OUTPUT: R2 cleanup-{tag}.json (audit trail)
//         + D1 wordOverrides patch (the user-visible effect)
//
// MECHANICS:
//   1. Resolve the session's pod (via QlaveSessionLog.podId)
//   2. Fetch the pod's anchors
//   3. Read diarization words (memory or R2)
//   4. Run findAnchorEdits (pure fuzzy match + scoring)
//   5. Merge new edits with existing wordOverrides, respecting locks
//   6. Write audit JSON to R2
//   7. Patch wordOverrides on the SessionDiarization row (D1)
//
// COUPLING WITH DIARIZE:
//   Cleanup is a NON-FATAL pass. If anything fails (no pod, no anchors,
//   empty diarization, R2 error), the step returns status="failed" with a
//   reason but the rest of the pipeline (timeline) can still proceed from
//   the raw diarization. Timeline reads from diarization.json, not from
//   wordOverrides — overrides apply at read time via getSessionDiarization.
//
// IF NO POD OR NO ANCHORS:
//   Step returns "skipped" with reason. This is normal for fresh accounts
//   that haven't set up vocab yet.

import { db } from "@/db";
import {
  parseWordOverrides,
  type DiarizedWord,
} from "@/lib/diarization/utterances";
import {
  findAnchorEdits,
  mergeCleanupIntoOverrides,
} from "@/lib/cleanup/fuzzyMatch";
import {
  cleanupKey as buildCleanupKey,
  CLEANUP_ARTIFACT_VERSION,
  type CleanupArtifact,
} from "@/lib/cleanup/storage";

import type {
  CleanupOpts,
  Step,
  StepResult,
  StepRunContext,
} from "../types";
import type { DiarizeArtifacts } from "./diarize";

const STEP_NAME  = "cleanup" as const;
const DEPENDS_ON = ["diarize"] as const;

// Same path convention as diarize.ts step (which inlines this builder).
// Kept in lockstep — if diarize.ts changes its path, change this one too.
const diarizationKeyTagged = (o: string, s: string, p: string, tag: string) =>
  `${o}/${s}/${p}/diarization-${tag}.json`;

export const cleanupStep: Step<CleanupOpts> = {
  name:      STEP_NAME,
  dependsOn: DEPENDS_ON,

  defaultOpts(_env, _ids): CleanupOpts {
    return {
      mode:      "auto",
      threshold: 0.7,
      minLevSim: 0.55,
      tag:       "nova3",
    };
  },

  async run(opts: CleanupOpts, ctx: StepRunContext): Promise<StepResult> {
    const startedAt = Date.now();
    const { env, ids } = ctx;
    const { organizationId, sessionId, peerId, siteKey } = ids;
    const tag = opts.tag ?? "nova3";

    try {
      // ── 1. Resolve pod ─────────────────────────────────────────────────
      const log = await db.qlaveSessionLog.findFirst({
        where:  { sessionId, siteKey },
        select: { podId: true },
      });

      if (!log?.podId) {
        return {
          step:       STEP_NAME,
          status:     "skipped",
          reason:     "no pod attached to session",
          durationMs: Date.now() - startedAt,
        };
      }

      // ── 2. Fetch pod anchors ───────────────────────────────────────────
      const anchorRows = await db.podAnchor.findMany({
        where:  { podId: log.podId },
        select: { canonical: true },
      });

      const anchors = anchorRows.map(a => a.canonical).filter(Boolean);
      if (anchors.length === 0) {
        return {
          step:       STEP_NAME,
          status:     "skipped",
          reason:     "pod has no anchors",
          durationMs: Date.now() - startedAt,
        };
      }

      // ── 3. Get diarization words ───────────────────────────────────────
      // Prefer in-memory result from a just-ran diarize step. Fall back to
      // reading diarization.json from R2 (regen case where diarize was skipped).
      let words: DiarizedWord[] = [];

      const fromDiarize = ctx.inMemoryArtifacts.get("diarize") as DiarizeArtifacts | undefined;
      if (fromDiarize?.result?.words && fromDiarize.result.words.length > 0) {
        words = fromDiarize.result.words;
      } else {
        // Read from R2 — diarization.json sits at the tagged path.
        const diarKey = ctx.existing.diarization.key ?? diarizationKeyTagged(organizationId, sessionId, peerId, tag);
        const obj = await env.RECORDING_BUCKET.get(diarKey);
        if (!obj) {
          return {
            step:       STEP_NAME,
            status:     "failed",
            reason:     `diarization not in memory and not at R2 key ${diarKey}`,
            durationMs: Date.now() - startedAt,
          };
        }
        try {
          const text   = await obj.text();
          const parsed = JSON.parse(text) as { words?: DiarizedWord[] };
          words = parsed.words ?? [];
        } catch (e: any) {
          return {
            step:       STEP_NAME,
            status:     "failed",
            reason:     `failed to parse diarization.json: ${e?.message ?? e}`,
            durationMs: Date.now() - startedAt,
          };
        }
      }

      if (words.length === 0) {
        return {
          step:       STEP_NAME,
          status:     "skipped",
          reason:     "diarization has no words",
          durationMs: Date.now() - startedAt,
        };
      }

      // ── 4. Load existing wordOverrides + run fuzzy match ───────────────
      const diarRow = await db.sessionDiarization.findFirst({
        where: {
          sessionId,
          peerId,
          tag,
        },
        select: { wordOverrides: true },
      });

      const existingOverrides = parseWordOverrides(diarRow?.wordOverrides);

      const result = findAnchorEdits(words, anchors, {
        threshold:     opts.threshold ?? 0.7,
        minLevSim:     opts.minLevSim ?? 0.55,
        lockedIndices: existingOverrides.locks,
      });

      // ── 5. Merge into wordOverrides ────────────────────────────────────
      const merged = mergeCleanupIntoOverrides(existingOverrides, result.edits);

      // ── 6. Build + write the audit artifact ────────────────────────────
      const cleanupK = buildCleanupKey(organizationId, sessionId, peerId, tag);

      // Partition candidates into (a) below threshold, (b) above threshold
      // but locked — for the audit. The findAnchorEdits result already
      // applied the lock filter to .edits, so we identify locked candidates
      // by cross-referencing.
      const lockedSet = new Set(existingOverrides.locks);
      const candidatesBelowThreshold = result.candidates.filter(c => c.score < (opts.threshold ?? 0.7));
      const candidatesLocked         = result.candidates.filter(
        c => c.score >= (opts.threshold ?? 0.7) && lockedSet.has(c.wordIndex)
      );

      const artifact: CleanupArtifact = {
        version:     CLEANUP_ARTIFACT_VERSION,
        ranAt:       new Date().toISOString(),
        tag,
        podId:       log.podId,
        anchors,
        params: {
          threshold: opts.threshold ?? 0.7,
          minLevSim: opts.minLevSim ?? 0.55,
        },
        editsApplied:             result.edits,
        candidatesBelowThreshold,
        candidatesLocked,
        unmatchedAnchors:         result.unmatchedAnchors,
        wordCount:                words.length,
      };

      const artifactJson  = JSON.stringify(artifact);
      const artifactBytes = new TextEncoder().encode(artifactJson).byteLength;

      await env.RECORDING_BUCKET.put(cleanupK, artifactJson, {
        httpMetadata:   { contentType: "application/json" },
        customMetadata: {
          tag,
          podId:        log.podId,
          editsApplied: String(result.edits.length),
          anchorCount:  String(anchors.length),
          wordCount:    String(words.length),
        },
      });

      // ── 7. Write merged wordOverrides to D1 ────────────────────────────
      // We do this here, not in patchStepResult, because wordOverrides isn't
      // a step-specific *Status field — it's a column that the cleanup step
      // owns alongside the cleanup_* artifact tracking fields.
      await db.sessionDiarization.updateMany({
        where: { sessionId, peerId, tag },
        data:  { wordOverrides: JSON.stringify(merged) },
      });

      return {
        step:                STEP_NAME,
        status:              "done",
        artifactKey:         cleanupK,
        artifactBytes,
        artifactGeneratedAt: new Date(),
        extras: {
          editsApplied:  result.edits.length,
          anchorsTotal:  anchors.length,
          anchorsMatched: anchors.length - result.unmatchedAnchors.length,
          wordCount:     words.length,
        },
        durationMs: Date.now() - startedAt,
      };
    } catch (err: any) {
      return {
        step:       STEP_NAME,
        status:     "failed",
        reason:     String(err?.message ?? err),
        durationMs: Date.now() - startedAt,
      };
    }
  },
};