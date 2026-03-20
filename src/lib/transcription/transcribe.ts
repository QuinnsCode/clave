// lib/transcription/transcribe.ts
// Per-model runners + shared dispatcher.
// Each runner merges model tuning defaults with any user-supplied overrides.

import type { TranscribeInput, TranscribeResult } from "@/types";
import {
  TRANSCRIPTION_MODELS,
  type TranscriptionModelKey,
  type WhisperTuning,
  type Nova3Tuning,
} from "./models";

// ─── Shared result shape ─────────────────────────────────────────────────────

function makeResult(
  text: string,
  durationSeconds: number,
  segments: { start: number; end: number; text: string }[],
  chunkStartTime: number | undefined
): TranscribeResult {
  return { text, durationSeconds, segments, chunkStartTime: chunkStartTime ?? 0 };
}

// ─── Runner: whisper-tiny-en ─────────────────────────────────────────────────
// Input:    number[] (uint8array decoded from base64)
// Tuning:   none — no tunable params supported
// Response: { text, words: [{ word, start, end }] }

async function runWhisperTiny(
  ai: Ai,
  input: TranscribeInput
): Promise<TranscribeResult> {
  const raw   = atob(input.audioBase64);
  const audio = Array.from({ length: raw.length }, (_, i) => raw.charCodeAt(i));

  const response = await ai.run("@cf/openai/whisper-tiny-en" as any, { audio }) as any;

  const text            = response.text?.trim() ?? "";
  const words: any[]    = response.words ?? [];
  const durationSeconds = words.length > 0 ? (words[words.length - 1].end ?? 0) : 0;
  const segments        = words.length > 0
    ? [{ start: words[0].start ?? 0, end: words[words.length - 1].end ?? 0, text }]
    : [];

  return makeResult(text, durationSeconds, segments, input.chunkStartTime);
}

// ─── Runner: whisper / whisper-large-v3-turbo ────────────────────────────────
// Input:    base64 string
// Tuning:   model defaults merged with input.tuning overrides
// Response: { text, transcription_info: { duration }, segments: [...] }

async function runWhisper(
  ai: Ai,
  input: TranscribeInput,
  modelKey: TranscriptionModelKey
): Promise<TranscribeResult> {
  const model  = TRANSCRIPTION_MODELS[modelKey];
  const tuning = { ...model.tuning, ...(input.tuning as WhisperTuning ?? {}) };

  const response = await ai.run(model.id as any, {
    audio: input.audioBase64,
    ...(model.supportsLanguages     ? { language: input.language ?? "en" }                         : {}),
    ...(model.supportsInitialPrompt && input.previousText ? { initial_prompt: input.previousText } : {}),
    ...tuning,
  }) as any;

  const text            = response.text?.trim() ?? "";
  const durationSeconds = response.transcription_info?.duration ?? 0;
  const segments        = model.supportsSegments
    ? (response.segments ?? []).map((s: any) => ({
        start: s.start,
        end:   s.end,
        text:  s.text?.trim() ?? "",
      }))
    : [];

  return makeResult(text, durationSeconds, segments, input.chunkStartTime);
}

// ─── Runner: nova-3 (Deepgram) ───────────────────────────────────────────────
// Input:    { body: ReadableStream, contentType: string }
// Tuning:   model defaults merged with input.tuning overrides
// Response: { results: { channels: [{ alternatives: [{ transcript, words }] }] } }
// Note:     returnRawResponse: true → must parse JSON manually

async function runNova3(
  ai: Ai,
  input: TranscribeInput
): Promise<TranscribeResult> {
  const model  = TRANSCRIPTION_MODELS["nova-3"];
  const tuning = { ...model.tuning, ...(input.tuning as Nova3Tuning ?? {}) };

  const binary = atob(input.audioBase64);
  const bytes  = Uint8Array.from({ length: binary.length }, (_, i) => binary.charCodeAt(i));

  const rawResponse = await ai.run("@cf/deepgram/nova-3" as any, {
    audio: {
      body:        new Response(bytes).body,
      contentType: input.mimeType ?? "audio/webm",
    },
    detect_language: !input.language,
    ...(input.language ? { language: input.language } : {}),
    ...tuning,
  }, { returnRawResponse: true }) as any;

  const data        = await rawResponse.json();
  const alternative = data?.results?.channels?.[0]?.alternatives?.[0];
  const text        = alternative?.transcript?.trim() ?? "";
  const words: any[] = alternative?.words ?? [];

  const durationSeconds = words.length > 0 ? (words[words.length - 1].end ?? 0) : 0;
  const segments        = words.length > 0
    ? [{ start: words[0].start ?? 0, end: words[words.length - 1].end ?? 0, text }]
    : [];

  return makeResult(text, durationSeconds, segments, input.chunkStartTime);
}

// ─── Runner: flux (Deepgram) — NOT YET IMPLEMENTED ───────────────────────────
// Flux is WebSocket-only — requires a persistent WS connection through the DO,
// not a request/response chunk call. Implement as a separate DO-level feature.

async function runFlux(): Promise<never> {
  throw new Error(
    "Flux is WebSocket-only and cannot be used in the chunk pipeline. " +
    "Use the Durable Object WebSocket integration instead."
  );
}

// ─── Dispatcher ──────────────────────────────────────────────────────────────

export async function transcribeAudio(
  ai: Ai,
  input: TranscribeInput & { model?: TranscriptionModelKey }
): Promise<TranscribeResult> {
  const modelKey = input.model ?? "whisper-large-v3-turbo";
  const model    = TRANSCRIPTION_MODELS[modelKey];

  switch (model.inputFormat) {
    case "uint8array": return runWhisperTiny(ai, input);
    case "stream":     return runNova3(ai, input);
    case "websocket":  return runFlux();
    case "base64":
    default:           return runWhisper(ai, input, modelKey);
  }
}