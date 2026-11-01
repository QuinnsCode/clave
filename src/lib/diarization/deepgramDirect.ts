// src/lib/diarization/deepgramDirect.ts
//
// Deepgram Listen API direct provider.
// Calls POST https://api.deepgram.com/v1/listen with nova-3 model + diarize.
// Pricing: $0.0043 / audio minute = $0.26/hour (batch). Comes with a $200
// free credit on new accounts which makes it useful for development.
//
// This is the SAME nova-3 model that Workers AI exposes, just called directly
// instead of through the AI binding. Use this when:
//   - You want the $200 free credit without burning Workers AI compute
//   - You're hitting Workers AI rate limits
//   - You need a feature not yet exposed through the binding
//
// Endpoint reference: https://developers.deepgram.com/reference/listen-file
// Server-only. Requires env.DEEPGRAM_API_KEY.

import type {
    DiarizationProvider,
    DiarizationResult,
    DiarizationOpts,
    DiarizationWord,
    ProviderName,
  } from "./types";
  
  // ── Deepgram Listen response shape ──────────────────────────────────────────
  // Identical to what Workers AI nova-3 returns, since it's the same model.
  // We re-declare the shape here rather than importing from nova3.ts to keep
  // providers independent (deleting nova3.ts shouldn't break this file).
  
  interface DeepgramResponse {
    metadata?: {
      duration?:   number;
      request_id?: string;
      [k: string]: unknown;
    };
    results?: {
      channels?: Array<{
        alternatives?: Array<{
          transcript?: string;
          words?: Array<{
            word:        string;
            start:       number;
            end:         number;
            speaker?:    number;
            confidence?: number;
          }>;
        }>;
      }>;
    };
    [k: string]: unknown;
  }
  
  // ── Provider ─────────────────────────────────────────────────────────────────
  
  export class DeepgramDirectProvider implements DiarizationProvider {
    readonly name: ProviderName = "deepgram-direct";
  
    /**
     * @param apiKey Deepgram API key. Get one at https://console.deepgram.com
     *               New accounts get $200 free credit.
     */
    constructor(private readonly apiKey: string) {
      if (!apiKey) {
        throw new Error("DeepgramDirectProvider requires an API key");
      }
    }
  
    async diarize(
      audio: ArrayBuffer | ReadableStream<Uint8Array>,
      mimeType: string,
      opts: DiarizationOpts = {},
    ): Promise<DiarizationResult> {
      // Deepgram's Listen API takes options as query params and the audio body
      // as the request body directly (no multipart). Build the URL with params.
      const url = new URL("https://api.deepgram.com/v1/listen");
  
      url.searchParams.set("model",        "nova-3");
      url.searchParams.set("diarize",      "true");
      url.searchParams.set("punctuate",    "true");
      url.searchParams.set("smart_format", "true");
  
      // Language hint. Default en-US; nova-3 also supports "multi".
      url.searchParams.set("language", opts.language ?? "en-US");
  
      // Vocabulary boost. Deepgram's `keyterm` param accepts repeated values —
      // append once per term so each gets boosted independently.
      if (opts.vocabulary && opts.vocabulary.length > 0) {
        for (const term of opts.vocabulary) {
          url.searchParams.append("keyterm", term);
        }
      }
  
      // ── Call ───────────────────────────────────────────────────────────────
      let raw: DeepgramResponse;
      try {
        const res = await fetch(url.toString(), {
          method: "POST",
          headers: {
            Authorization: `Token ${this.apiKey}`,
            "Content-Type": mimeType,
          },
          body: audio instanceof ArrayBuffer ? new Uint8Array(audio) : audio,
        });
  
        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          throw new Error(`Deepgram ${res.status}: ${errText.slice(0, 500)}`);
        }
  
        raw = await res.json() as DeepgramResponse;
      } catch (err: any) {
        throw new Error(`Deepgram direct call failed: ${err?.message ?? err}`);
      }
  
      return normalizeDeepgramResponse(raw);
    }
  }
  
  // ── Response normalization ───────────────────────────────────────────────────
  // Same shape as nova-3 (same model). Logic mirrors nova3.ts deliberately.
  
  function normalizeDeepgramResponse(raw: DeepgramResponse): DiarizationResult {
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
            endMs:      Math.round(w.end * 1000),
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
      provider:    "deepgram-direct",
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