// src/lib/diarization/grok.ts
//
// xAI Grok STT diarization provider.
// Calls POST https://api.x.ai/v1/stt with multipart audio + diarize flag.
// Pricing: $0.10 / audio hour (batch). Strong on entity recognition
// (proper nouns, business terms) per xAI's own benchmarks.
//
// Endpoint reference: https://docs.x.ai/developers/model-capabilities/audio/speech-to-text
//
// Design notes (all from the official docs, verified Jun 2026):
//   - Endpoint: POST https://api.x.ai/v1/stt  (no `model` field — one model behind the URL)
//   - Request:  multipart/form-data
//   - `file` MUST be the last field in the multipart form (docs call this out twice)
//   - `diarize` defaults to false — must be explicitly true to get speaker labels
//   - `keyterm` is a REPEATED multipart field (not comma-joined), max 100 terms × 50 chars
//   - `format=true` requires `language` to also be set, else 400
//   - Response: { text, language, duration, words: [{ text, start, end, speaker? }] }
//     - field is `text` NOT `word`
//     - `start`/`end` are SECONDS as floats (multiply by 1000 for our shape)
//     - `speaker` is an INTEGER (0, 1, ...) when diarize=true, absent otherwise
//     - NO per-word `confidence` field
//
// Posture: library, not policy. We apply sane defaults from cross-provider
// opts, then let providerOpts.grok override anything (including our defaults).
// Errors bubble up with the xAI response body verbatim — we don't swallow
// or reinterpret.
//
// Server-only. Requires env.XAI_API_KEY.

import type {
    DiarizationProvider,
    DiarizationResult,
    DiarizationOpts,
    DiarizationWord,
    ProviderName,
    GrokOptValue,
  } from "./types";
  
  // ── Grok STT response shape (loose — we only use a few fields) ──────────────
  
  interface GrokSttResponse {
    text?:     string;
    language?: string;
    duration?: number;
    words?: Array<{
      text:     string;          // NOTE: "text", not "word"
      start:    number;          // seconds
      end:      number;          // seconds
      speaker?: number;          // integer when diarize=true
      channel?: number | null;   // present when multichannel=true
    }>;
    channels?: unknown;          // present when multichannel=true
    [k: string]: unknown;
  }
  
  // ── Provider ─────────────────────────────────────────────────────────────────
  
  export class GrokProvider implements DiarizationProvider {
    readonly name: ProviderName = "grok";
  
    /**
     * @param apiKey xAI API key. Get one at https://console.x.ai
     */
    constructor(private readonly apiKey: string) {
      if (!apiKey) {
        throw new Error("GrokProvider requires an API key");
      }
    }
  
    async diarize(
      audio: ArrayBuffer | ReadableStream<Uint8Array>,
      mimeType: string,
      opts: DiarizationOpts = {},
    ): Promise<DiarizationResult> {
      // Buffer streams to bytes — multipart upload needs known length
      const bytes = audio instanceof ArrayBuffer
        ? new Uint8Array(audio)
        : await readStreamToBytes(audio);
  
      // ── Build the merged field map ─────────────────────────────────────────
      // 1. Start with our defaults derived from cross-provider opts
      // 2. Layer providerOpts.grok on top — caller overrides win
      // 3. Walk the merged map into FormData, file last
      const defaults: Record<string, GrokOptValue> = {
        diarize: true,
      };
  
      // Map cross-provider `language` → Grok's `language` (strip BCP-47 region)
      // nova-3 wants "en-US", Grok wants "en"
      if (opts.language && opts.language !== "multi") {
        defaults.language = opts.language.split("-")[0]!.toLowerCase();
      }
  
      // Map cross-provider `vocabulary` → Grok's repeated `keyterm`
      if (opts.vocabulary && opts.vocabulary.length > 0) {
        defaults.keyterm = opts.vocabulary;
      }
  
      // contextPrompt has no equivalent in Grok STT — silently dropped.
      // (If a caller wants to bias on context, they should use vocabulary
      // or pass their own providerOpts.grok.keyterm)
  
      const overrides = opts.providerOpts?.grok ?? {};
      const merged: Record<string, GrokOptValue> = { ...defaults, ...overrides };
  
      // ── Build FormData ─────────────────────────────────────────────────────
      const form = new FormData();
  
      for (const [key, value] of Object.entries(merged)) {
        // skip undefined/null so callers can erase a default with an explicit undefined
        if (value === undefined || value === null) continue;
  
        if (Array.isArray(value)) {
          // Repeated multipart field (e.g. keyterm). Append once per item.
          for (const item of value) {
            form.append(key, String(item));
          }
        } else if (typeof value === "boolean") {
          // xAI accepts "true"/"false" strings for boolean fields
          form.append(key, value ? "true" : "false");
        } else {
          form.append(key, String(value));
        }
      }
  
      // The audio file MUST be last per xAI docs ("The file parameter must be
      // provided after all other parameters in the multipart form").
      form.append(
        "file",
        new Blob([bytes], { type: mimeType }),
        mimeFilename(mimeType),
      );
  
      // ── Call ───────────────────────────────────────────────────────────────
      // NOTE: don't set Content-Type — FormData sets it with the correct
      // multipart boundary. Setting it manually clobbers the boundary → 400.
      const res = await fetch("https://api.x.ai/v1/stt", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: form,
      });
  
      if (!res.ok) {
        // Bubble up the raw xAI error verbatim — they have good error messages
        // ("format=true requires language", etc). Don't reinterpret.
        const errText = await res.text().catch(() => "");
        throw new Error(
          `Grok STT ${res.status} ${res.statusText}: ${errText.slice(0, 1000)}`,
        );
      }
  
      const raw = await res.json() as GrokSttResponse;
      return normalizeGrokResponse(raw);
    }
  }
  
  // ── Response normalization ───────────────────────────────────────────────────
  
  function normalizeGrokResponse(raw: GrokSttResponse): DiarizationResult {
    const words: DiarizationWord[] = [];
    const speakerSet = new Set<string>();
  
    if (Array.isArray(raw.words)) {
      for (const w of raw.words) {
        // Speaker is an integer (or absent if diarize=false). Normalize to "speaker_N".
        const speakerLabel = typeof w.speaker === "number"
          ? `speaker_${w.speaker}`
          : "speaker_0";
        speakerSet.add(speakerLabel);
  
        words.push({
          text:    w.text,                          // field is "text" not "word"
          startMs: Math.round(w.start * 1000),
          endMs:   Math.round(w.end * 1000),
          speaker: speakerLabel,
          // Grok doesn't return per-word confidence — field omitted
        });
      }
    }
  
    // Fall back to a speaker-tagged transcript if Grok didn't send a plain one
    // (it usually does — `text` is always present at top level)
    let transcript = raw.text ?? "";
    if (!transcript && words.length > 0) {
      transcript = renderSpeakerTaggedTranscript(words);
    }
  
    return {
      words,
      speakers:    [...speakerSet].sort(),
      transcript,
      provider:    "grok",
      durationSec: raw.duration,
      raw,
    };
  }
  
  function renderSpeakerTaggedTranscript(words: DiarizationWord[]): string {
    const out: string[] = [];
    let currentSpeaker: string | null = null;
    for (const w of words) {
      if (w.speaker !== currentSpeaker) {
        if (currentSpeaker !== null) out.push("\n");
        out.push(`[${w.speaker}] `);
        currentSpeaker = w.speaker;
      }
      out.push(w.text + " ");
    }
    return out.join("").trim();
  }
  
  // ── Helpers ──────────────────────────────────────────────────────────────────
  
  async function readStreamToBytes(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.byteLength;
    }
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
      merged.set(c, offset);
      offset += c.byteLength;
    }
    return merged;
  }
  
  function mimeFilename(mimeType: string): string {
    // Multipart servers sometimes care about the extension even when
    // content-type is set. Map common types to extensions xAI accepts.
    // Supported formats per docs: WAV, MP3, OGG, Opus, FLAC, AAC, MP4, M4A, MKV
    if (mimeType.startsWith("audio/webm")) return "audio.webm";
    if (mimeType.startsWith("audio/mpeg")) return "audio.mp3";
    if (mimeType.startsWith("audio/wav"))  return "audio.wav";
    if (mimeType.startsWith("audio/ogg"))  return "audio.ogg";
    if (mimeType.startsWith("audio/opus")) return "audio.opus";
    if (mimeType.startsWith("audio/flac")) return "audio.flac";
    if (mimeType.startsWith("audio/aac"))  return "audio.aac";
    if (mimeType.startsWith("audio/mp4"))  return "audio.m4a";
    return "audio.bin";
  }