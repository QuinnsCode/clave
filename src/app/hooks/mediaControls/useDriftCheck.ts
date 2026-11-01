// src/lib/hooks/mediaControls/useDriftCheck.ts
//
// TEMPORARY — remove once karaoke timing is verified working.
// Marked for deletion alongside DriftOverlay + driftCheck.ts.
//
// React wrapper around buildDriftSnapshot. Memoizes per (words, markers,
// currentMs) so the overlay only re-renders when one of those changes.

import { useMemo } from "react";
import {
  buildDriftSnapshot,
  type DriftSnapshot,
  type SpeakerHoldMarker,
} from "@/lib/diarization/driftCheck";
import type { DiarizedWord } from "@/lib/diarization/utterances";

export interface UseDriftCheckParams {
  words:     DiarizedWord[] | undefined | null;
  markers:   SpeakerHoldMarker[] | undefined | null;
  currentMs: number;
}

export function useDriftCheck({
  words,
  markers,
  currentMs,
}: UseDriftCheckParams): DriftSnapshot {
  return useMemo(
    () => buildDriftSnapshot(words, markers, currentMs),
    [words, markers, currentMs],
  );
}