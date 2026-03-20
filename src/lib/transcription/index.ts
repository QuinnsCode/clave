// lib/transcription/index.ts
// Public surface — import from here, not from internals.
// Keeping this thin means the standalone product just swaps the route handler.

export { transcribeAudio } from "./transcribe";
export { checkAndIncrementUsage, getUsage, getCapForTier, TRANSCRIPTION_TIERS } from "./usage";

// Re-export transcription types from central types — single source of truth
export type {
  TranscribeInput,
  TranscribeResult,
  TranscribeError,
  TranscribeResponse,
  UsageRecord,
  TranscriptionTier,
  CaptionMessage,
} from "@/types";