// src/lib/diarization/index.ts
//
// Provider factory. Reads env.DIARIZATION_PROVIDER and returns the matching
// DiarizationProvider implementation. Swap providers by flipping the env var
// — no code change, no redeploy needed beyond setting the secret.
//
// Available providers:
//   - "workers-ai-nova3" (default) — Cloudflare Workers AI binding, ~$0.31/hr
//   - "grok"                        — xAI Grok STT, ~$0.10/hr, best entity recognition
//   - "deepgram-direct"             — Deepgram Listen API direct, ~$0.26/hr, $200 free credit
//
// All three produce the same DiarizationResult shape. Callers don't care which
// one is selected.
//
// Server-only file.

import type { DiarizationProvider, ProviderName } from "./types";
import { Nova3Provider }            from "./nova3";
import { GrokProvider }             from "./grok";
import { DeepgramDirectProvider }   from "./deepgramDirect";

/**
 * Resolve which provider to use for this deployment.
 * Default: workers-ai-nova3 (no extra config needed beyond the AI binding).
 */
export function getDiarizationProvider(env: ProviderEnv): DiarizationProvider {
  const requested = (env.DIARIZATION_PROVIDER ?? "workers-ai-nova3") as ProviderName;

  switch (requested) {
    case "workers-ai-nova3": {
      const ai = env.AI ?? env.TRANSCRIPTION_AI;
      if (!ai) {
        throw new Error(
          "workers-ai-nova3 selected but no AI binding found. " +
          "Add `AI` or `TRANSCRIPTION_AI` binding to wrangler.jsonc."
        );
      }
      return new Nova3Provider(ai);
    }

    case "grok": {
      if (!env.XAI_API_KEY) {
        throw new Error(
          "grok provider selected but XAI_API_KEY is not set. " +
          "Run: wrangler secret put XAI_API_KEY"
        );
      }
      return new GrokProvider(env.XAI_API_KEY);
    }

    case "deepgram-direct": {
      if (!env.DEEPGRAM_API_KEY) {
        throw new Error(
          "deepgram-direct provider selected but DEEPGRAM_API_KEY is not set. " +
          "Run: wrangler secret put DEEPGRAM_API_KEY"
        );
      }
      return new DeepgramDirectProvider(env.DEEPGRAM_API_KEY);
    }

    default:
      throw new Error(`Unknown DIARIZATION_PROVIDER: ${requested}`);
  }
}

// ── Env shape we need ────────────────────────────────────────────────────────
// Narrow on purpose — only the bits the factory and providers actually read.
// The full Env type lives elsewhere; this just states what bindings are
// needed for each provider.

export interface ProviderEnv {
  /** Which provider to use. Default: "workers-ai-nova3". */
  DIARIZATION_PROVIDER?: string;

  /** Workers AI binding (nova3 provider). Either name accepted. */
  AI?: { run(model: string, params: unknown): Promise<unknown> };
  TRANSCRIPTION_AI?: { run(model: string, params: unknown): Promise<unknown> };

  /** xAI API key (grok provider). Set via wrangler secret put XAI_API_KEY. */
  XAI_API_KEY?: string;

  /** Deepgram API key (deepgram-direct provider). Set via wrangler secret put DEEPGRAM_API_KEY. */
  DEEPGRAM_API_KEY?: string;
}

// Re-export types for convenience so callers can `import { ... } from "@/lib/diarization"`
export type {
  DiarizationProvider,
  DiarizationResult,
  DiarizationOpts,
  DiarizationWord,
  ProviderName,
} from "./types";