// src/lib/hooks/mediaControls/useActiveWords.ts
//
// React wrapper around getActiveWords. Memoizes the result keyed on
// (words ref, currentMs) so SpeakerBubbles doesn't recompute on unrelated
// renders.
//
// Returns Map<speakerId, wordIndex>. Empty map when nothing is active.

import { useMemo } from "react";
import { getActiveWords, type ActiveWordsMap } from "@/lib/diarization/activeWords";
import type { DiarizedWord } from "@/lib/diarization/utterances";

export function useActiveWords(
  words: DiarizedWord[],
  currentMs: number,
): ActiveWordsMap {
  return useMemo(
    () => getActiveWords(words, currentMs),
    [words, currentMs],
  );
}