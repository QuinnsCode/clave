// src/lib/diarization/nova3.ts
//
// Workers AI nova-3 diarization provider.
// Matches Cloudflare's official example from
// https://developers.cloudflare.com/workers-ai/models/nova-3/
//   - audio.body is a ReadableStream
//   - third arg { returnRawResponse: true } returns a Response
//   - we .json() the Response ourselves
//
// Pricing (Cloudflare Workers AI, HTTP): ~$0.0052 / audio minute = $0.31/hour.
// Server-only — needs the AI binding. Don't import from client components.
//
// Posture: same as grok.ts — library, not policy. Cross-provider opts are
// mapped to nova-3's equivalents with defaults. Anything in
// providerOpts["workers-ai-nova3"] spreads on top and overrides our defaults.
// Errors bubble up with the binding's original message.

import type {
    DiarizationProvider,
    DiarizationResult,
    DiarizationOpts,
    DiarizationWord,
    ProviderName,
  } from "./types";
  
  // ── nova-3 native response shape (loose — we only use a few fields) ──────────
  
  interface Nova3Response {
    metadata?: {
      duration?:    number;
      request_id?:  string;
      [k: string]: unknown;
    };
    results?: {
      channels?: Array<{
        alternatives?: Array<{
          transcript?: string;
          words?: Array<{
            word:        string;
            start:       number;     // seconds
            end:         number;     // seconds
            speaker?:    number;
            confidence?: number;
          }>;
        }>;
      }>;
    };
    [k: string]: unknown;
  }
  
  // ── Provider ─────────────────────────────────────────────────────────────────
  
  export class Nova3Provider implements DiarizationProvider {
    readonly name: ProviderName = "workers-ai-nova3";
  
    constructor(private readonly ai: Ai) {}
  
    async diarize(
      audio: ArrayBuffer | ReadableStream<Uint8Array>,
      mimeType: string,
      opts: DiarizationOpts = {},
    ): Promise<DiarizationResult> {
      // Per Cloudflare's official example, body must be a ReadableStream.
      // Wrapping an ArrayBuffer in `new Response(...)` is the cleanest way
      // to get a stream out of bytes.
      const body: ReadableStream<Uint8Array> = audio instanceof ArrayBuffer
        ? (new Response(audio).body as ReadableStream<Uint8Array>)
        : audio;
  
      // ── Build defaults from cross-provider opts ────────────────────────────
      const defaults: Record<string, unknown> = {
        diarize:      true,
        punctuate:    true,
        smart_format: true,
        language:     opts.language ?? "en-US",   // nova-3 wants BCP-47
        encoding:     "opus",   // NEW
      };
  
      // Vocabulary boost via keyterm. nova-3 takes a comma-separated string
      // (unlike Grok which wants repeated multipart fields).
      if (opts.vocabulary && opts.vocabulary.length > 0) {
        defaults.keyterm = opts.vocabulary.join(",");
      }
  
      // ── Layer caller overrides on top — they win on collision ──────────────
      const overrides = opts.providerOpts?.["workers-ai-nova3"] ?? {};
      const params: Record<string, unknown> = {
        // audio object is structural — caller can't override its shape,
        // they can only override the higher-level diarize/punctuate/etc.
        audio: {
          body,
          contentType: mimeType,
        },
        ...defaults,
        ...overrides,
      };
  
      let raw: Nova3Response;
      try {
        // The third arg {returnRawResponse: true} is REQUIRED per the official
        // example — otherwise the binding chokes with error 5006 on the audio
        // schema validation. Cast as any because @cloudflare/workers-types may
        // not have the third-arg overload typed yet.
        const rawResponse = await this.ai.run(
          "@cf/deepgram/nova-3",
          params,
          { returnRawResponse: true } as any,
        ) as Response;
        raw = await rawResponse.json() as Nova3Response;
      } catch (err: any) {
        // Bubble up verbatim — don't reinterpret the binding's error
        throw new Error(`nova-3 call failed: ${err?.message ?? err}`);
      }
  
      return normalizeNova3Response(raw);
    }
  }
  
  // ── Response normalization ───────────────────────────────────────────────────
  
  function normalizeNova3Response(raw: Nova3Response): DiarizationResult {
    const words: DiarizationWord[] = [];
    const speakerSet = new Set<string>();
    let fullTranscript = "";
  
    const alt = raw.results?.channels?.[0]?.alternatives?.[0];
    if (alt) {
      if (typeof alt.transcript === "string") {
        fullTranscript = alt.transcript;
      }
      if (Array.isArray(alt.words)) {
        for (const w of alt.words) {
          const speakerNum = typeof w.speaker === "number" ? w.speaker : 0;
          const speakerLabel = `speaker_${speakerNum}`;
          speakerSet.add(speakerLabel);
          words.push({
            text:       w.word,
            startMs:    Math.round(w.start * 1000),
            endMs:      Math.round(w.end   * 1000),
            speaker:    speakerLabel,
            confidence: w.confidence,
          });
        }
      }
    }
  
    if (!fullTranscript && words.length > 0) {
      fullTranscript = renderSpeakerTaggedTranscript(words);
    }
  
    return {
      words,
      speakers:    [...speakerSet].sort(),
      transcript:  fullTranscript,
      provider:    "workers-ai-nova3",
      durationSec: raw.metadata?.duration,
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
  
  // ── Workers AI binding type ──────────────────────────────────────────────────
  
  type Ai = {
    run(model: string, params: unknown, options?: unknown): Promise<unknown>;
  };