// lib/transcription/models.ts
// Model registry — capabilities, pricing, input format, tuning defaults, and availability gating.

// ─── Availability ─────────────────────────────────────────────────────────────

export type ModelAvailability =
  | "live"         // all users
  | "beta"         // a/b test cohort
  | "alpha"        // friends & family
  | "testing"      // internal / adminFriendsAndFamily only
  | "coming_soon"; // not yet selectable by anyone

// Which user roles can access each availability tier.
// Empty array = no role restriction (live = everyone, coming_soon = no one via role check).
export const AVAILABILITY_ROLES: Record<ModelAvailability, string[]> = {
  live:         [],
  beta:         ["beta"],
  alpha:        ["alpha", "adminFriendsAndFamily"],
  testing:      ["adminFriendsAndFamily"],
  coming_soon:  [],
};

export function isModelAvailable(
  availability: ModelAvailability,
  userRoles: string[]
): boolean {
  if (availability === "live")        return true;
  if (availability === "coming_soon") return false;
  return AVAILABILITY_ROLES[availability].some(r => userRoles.includes(r));
}

// ─── Tuning types ─────────────────────────────────────────────────────────────

export interface WhisperTuning {
  vad_filter?:                      boolean;
  condition_on_previous_text?:      boolean;
  beam_size?:                       number;
  no_speech_threshold?:             number;
  compression_ratio_threshold?:     number;
  log_prob_threshold?:              number;
  hallucination_silence_threshold?: number;
}

export interface Nova3Tuning {
  punctuate?:       boolean;
  smart_format?:    boolean;
  diarize?:         boolean;
  detect_language?: boolean;
  filler_words?:    boolean;
}

export interface FluxTuning {
  eot_threshold?:       string;  // "0.5" – "0.9", default "0.7"
  eager_eot_threshold?: string;  // "0.3" – "0.9", enables EagerEndOfTurn events
  eot_timeout_ms?:      string;  // ms before forced turn end, default "5000"
  keyterm?:             string;  // boost specialized terminology
}

export type ModelTuning = WhisperTuning | Nova3Tuning | FluxTuning;

// ─── Model registry ───────────────────────────────────────────────────────────

export const TRANSCRIPTION_MODELS = {
  "whisper-tiny-en": {
    id:                    "@cf/openai/whisper-tiny-en",
    label:                 "Whisper Tiny (EN only)",
    pricePerMinute:        0,
    neuronsPerMinute:      0,
    supportsSegments:      false,
    supportsLanguages:     false,
    supportsInitialPrompt: false,
    quality:               "low" as const,
    latency:               "fastest" as const,
    inputFormat:           "uint8array" as const,
    availability:          "testing" as ModelAvailability,
    tuning:                {} satisfies WhisperTuning,
  },
  "whisper": {
    id:                    "@cf/openai/whisper",
    label:                 "Whisper Base",
    pricePerMinute:        0.0005,
    neuronsPerMinute:      41.14,
    supportsSegments:      true,
    supportsLanguages:     true,
    supportsInitialPrompt: true,
    quality:               "medium" as const,
    latency:               "fast" as const,
    inputFormat:           "base64" as const,
    availability:          "testing" as ModelAvailability,
    tuning: {
      vad_filter:                      true,
      condition_on_previous_text:      false,
      beam_size:                       5,
      no_speech_threshold:             0.7,
      compression_ratio_threshold:     2.0,
      log_prob_threshold:              -0.5,
      hallucination_silence_threshold: 2.0,
    } satisfies WhisperTuning,
  },
  "whisper-large-v3-turbo": {
    id:                    "@cf/openai/whisper-large-v3-turbo",
    label:                 "Whisper Large v3 Turbo",
    pricePerMinute:        0.0005,
    neuronsPerMinute:      46.63,
    supportsSegments:      true,
    supportsLanguages:     true,
    supportsInitialPrompt: true,
    quality:               "high" as const,
    latency:               "fast" as const,
    inputFormat:           "base64" as const,
    availability:          "live" as ModelAvailability,
    tuning: {
      vad_filter:                      true,
      condition_on_previous_text:      false,
      beam_size:                       5,
      no_speech_threshold:             0.7,
      compression_ratio_threshold:     2.0,
      log_prob_threshold:              -0.5,
      hallucination_silence_threshold: 2.0,
    } satisfies WhisperTuning,
  },
  "nova-3": {
    id:                    "@cf/deepgram/nova-3",
    label:                 "Deepgram Nova 3",
    pricePerMinute:        0.0052,
    neuronsPerMinute:      472.73,
    supportsSegments:      true,
    supportsLanguages:     true,
    supportsInitialPrompt: false,
    quality:               "highest" as const,
    latency:               "fastest" as const,
    inputFormat:           "stream" as const,
    availability:          "testing" as ModelAvailability,
    tuning: {
      punctuate:    true,
      smart_format: true,
      diarize:      false,
      filler_words: false,
    } satisfies Nova3Tuning,
  },
  "flux": {
    id:                    "@cf/deepgram/flux",
    label:                 "Deepgram Flux",
    pricePerMinute:        0.0077,
    neuronsPerMinute:      0,  // websocket — billed differently
    supportsSegments:      true,
    supportsLanguages:     false,  // not yet in docs
    supportsInitialPrompt: false,
    quality:               "highest" as const,
    latency:               "realtime" as const,
    inputFormat:           "websocket" as const,
    availability:          "coming_soon" as ModelAvailability,
    tuning: {
      eot_threshold:   "0.7",
      eot_timeout_ms:  "5000",
    } satisfies FluxTuning,
  },
} as const;

export type TranscriptionModelKey = keyof typeof TRANSCRIPTION_MODELS;

export function computeCost(modelKey: TranscriptionModelKey, audioSeconds: number) {
  const model = TRANSCRIPTION_MODELS[modelKey];
  const minutes = audioSeconds / 60;
  return {
    costUsd:     model.pricePerMinute * minutes,
    neuronsUsed: model.neuronsPerMinute * minutes,
  };
}

// Returns models visible to a user given their roles.
// coming_soon and testing models are hidden unless user has the right role.
export function getAvailableModels(userRoles: string[] = []) {
  return (Object.keys(TRANSCRIPTION_MODELS) as TranscriptionModelKey[]).filter(key =>
    isModelAvailable(TRANSCRIPTION_MODELS[key].availability, userRoles)
  );
}