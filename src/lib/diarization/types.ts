// src/lib/diarization/types.ts
//
// Common shape every diarization provider returns. Implementations live in
// ./nova3.ts, ./grok.ts, ./deepgramDirect.ts — selected at runtime via
// env.DIARIZATION_PROVIDER (see ./index.ts).
//
// Design posture: this module is a thin library, not a policy layer.
// Cross-provider opts (vocabulary, language, contextPrompt) are mapped to
// each provider's equivalent field with sensible defaults. For anything
// else, callers pass raw provider-specific keys through `providerOpts` and
// we forward them untouched. Overrides win on collision. Errors bubble up
// with the provider's original message — we don't reinterpret.
//
// Server-only file. Don't import from client components.

// ── Hints we can pass per-call ───────────────────────────────────────────────

export interface DiarizationOpts {
    /**
     * Words/phrases to boost in recognition. Useful for fantasy proper nouns
     * ("Tharion Vex", "Mordenkainen"), product names, slang, jargon. Mapped to
     * whichever provider field handles term biasing (nova-3: `keyterm` string,
     * Grok: repeated `keyterm` multipart fields). Providers that don't support
     * boosting silently ignore.
     */
    vocabulary?: string[];
  
    /**
     * Language tag. Default "en". Providers may want different formats — we
     * normalize per-provider (nova-3 wants BCP-47 like "en-US", Grok wants
     * plain ISO-639-1 like "en"). Use "multi" for auto-detect where supported.
     */
    language?: string;
  
    /**
     * Free-form context that providers MAY pass to their model as a prompt.
     * No-op for providers without a prompt slot (nova-3, Grok STT).
     */
    contextPrompt?: string;
  
    /**
     * Provider-specific passthrough. Opaque to us — forwarded as-is to the
     * selected provider. Keyed by provider name so one opts object can carry
     * overrides for any backend. Values override our defaults on key collision.
     *
     * Examples:
     *   providerOpts: {
     *     grok: { format: true, filler_words: false, keyterm: ["extra"] },
     *     "workers-ai-nova3": { utterances: true },
     *   }
     *
     * Arrays in Grok's bucket become repeated multipart fields (the xAI API
     * expects `keyterm` repeated, not joined). Other providers handle arrays
     * per their own API conventions.
     */
    providerOpts?: {
      grok?: Record<string, GrokOptValue>;
      "workers-ai-nova3"?: Record<string, unknown>;
      "deepgram-direct"?: Record<string, unknown>;
    };
  }
  
  /** Values acceptable in Grok's passthrough — multipart form fields. */
  export type GrokOptValue = string | number | boolean | string[];
  
  // ── Result returned by every provider ────────────────────────────────────────
  
  export interface DiarizationWord {
    text:    string;
    startMs: number;
    endMs:   number;
    /** Speaker label assigned by the provider. Normalized to "speaker_0", "speaker_1", ... */
    speaker: string;
    /** Provider's raw confidence if available, else undefined. */
    confidence?: number;
  }
  
  export interface DiarizationResult {
    /** Per-word entries with speaker labels and timing. */
    words: DiarizationWord[];
  
    /** Distinct speaker labels seen across all words. Useful for quick UI count. */
    speakers: string[];
  
    /** Full plain-text transcript with speaker tags inline, for fallback display. */
    transcript: string;
  
    /** Which provider implementation produced this result. */
    provider: ProviderName;
  
    /** Duration of source audio in seconds, if the provider returns it. */
    durationSec?: number;
  
    /** Provider's raw response, preserved untouched for forensics. */
    raw: unknown;
  }
  
  // ── Provider interface — all implementations conform ─────────────────────────
  
  export interface DiarizationProvider {
    readonly name: ProviderName;
  
    /**
     * Diarize one continuous audio stream.
     *
     * @param audio    Raw audio bytes. Should be one contiguous file — the
     *                 provider can't reconcile speaker IDs across separate calls.
     * @param mimeType Content type. Common: "audio/webm", "audio/mpeg", "audio/wav".
     * @param opts     Optional hints (vocabulary, language, providerOpts, etc).
     */
    diarize(
      audio: ArrayBuffer | ReadableStream<Uint8Array>,
      mimeType: string,
      opts?: DiarizationOpts,
    ): Promise<DiarizationResult>;
  }
  
  export type ProviderName =
    | "workers-ai-nova3"
    | "grok"
    | "deepgram-direct";