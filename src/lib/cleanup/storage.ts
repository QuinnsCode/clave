// src/lib/cleanup/storage.ts
//
// R2 path conventions + audit artifact shape for the cleanup step.
//
// PATH:
//   {orgId}/{sessionId}/{peerId}/cleanup-{tag}.json
//
// CONTENT:
//   Audit trail of one cleanup run. Records:
//     - Anchors considered (snapshot of pod vocab at run time)
//     - All candidates scored (above min-similarity, may or may not have
//       become edits — useful for tuning the threshold)
//     - Edits actually applied (after threshold + lock filtering)
//     - Threshold + scoring parameters used
//     - Timestamps
//
// This artifact is NOT what the UI reads. UI reads wordOverrides from D1
// (which the cleanup step writes alongside the R2 artifact). The R2 file
// exists for diagnostics: "what did cleanup do on this session?", "did the
// anchor 'qlave' match anything?", future re-tuning.

import type { AnchorCandidate } from "./fuzzyMatch";
import type { WordEdit } from "@/lib/diarization/utterances";

export const CLEANUP_ARTIFACT_VERSION = 1;

export interface CleanupArtifact {
  /** Bump on shape changes. */
  version:    number;
  /** ISO timestamp when this cleanup ran. */
  ranAt:      string;
  /** Tag of the diarization this cleanup was based on. */
  tag:        string;
  /** Pod ID whose anchors were used (null if no pod resolved). */
  podId:      string | null;
  /** Snapshot of anchor canonicals used in this run. */
  anchors:    string[];
  /** Scoring parameters in effect. */
  params: {
    threshold: number;
    minLevSim: number;
  };
  /** Edits actually applied to wordOverrides (after threshold + lock filter). */
  editsApplied: WordEdit[];
  /** Candidates considered but below threshold. */
  candidatesBelowThreshold: AnchorCandidate[];
  /** Candidates above threshold but dropped due to a lock. */
  candidatesLocked: AnchorCandidate[];
  /** Anchors that produced zero above-threshold candidates. */
  unmatchedAnchors: string[];
  /** Total diarized words considered. */
  wordCount: number;
}

/** Build the canonical R2 key for the cleanup audit artifact. */
export function cleanupKey(
  orgId:     string,
  sessionId: string,
  peerId:    string,
  tag:       string,
): string {
  return `${orgId}/${sessionId}/${peerId}/cleanup-${tag}.json`;
}