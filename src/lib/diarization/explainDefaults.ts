// src/lib/diarization/explainDefaults.ts
//
// Route-layer helper. NOT used by providers.
//
// Given a caller's DiarizationOpts, returns a side-by-side view of:
//   - what they explicitly set
//   - what we'd default for them
//   - which of their settings override our defaults
//
// Call this in a route handler (or curl-facing endpoint) BEFORE invoking the
// provider, so you can surface "you set X, did you also want our defaults
// Y and Z?" to the caller. Useful for the dry-run UX where a human is
// experimenting with provider options from the command line.
//
// Providers themselves stay silent — this is pure introspection.
//
// Usage in a route:
//
//   const explain = explainDefaults("grok", userOpts);
//   if (req.query.dryRun) {
//     return Response.json({ explain });
//   }
//   const result = await provider.diarize(audio, mime, userOpts);
//   return Response.json({ result, explain });
//
// Server-only file.

import type { DiarizationOpts, ProviderName } from "./types";

export interface ExplainedOpts {
  /** Provider these defaults apply to. */
  provider: ProviderName;
  /** Fields the caller explicitly set in providerOpts[provider]. */
  callerSet: Record<string, unknown>;
  /** Fields we would default (derived from cross-provider opts + provider's baseline). */
  defaults: Record<string, unknown>;
  /** Fields where caller's value overrides our default (key collision). */
  overridden: Array<{ key: string; default: unknown; callerValue: unknown }>;
  /** Defaults the caller did NOT override — these will be used as-is. */
  defaultsApplied: Record<string, unknown>;
}

export function explainDefaults(
  provider: ProviderName,
  opts: DiarizationOpts,
): ExplainedOpts {
  const defaults = computeDefaults(provider, opts);
  const callerSet = (opts.providerOpts?.[provider] as Record<string, unknown>) ?? {};

  const overridden: ExplainedOpts["overridden"] = [];
  const defaultsApplied: Record<string, unknown> = {};

  for (const [key, defVal] of Object.entries(defaults)) {
    if (key in callerSet) {
      overridden.push({
        key,
        default: defVal,
        callerValue: callerSet[key],
      });
    } else {
      defaultsApplied[key] = defVal;
    }
  }

  return {
    provider,
    callerSet,
    defaults,
    overridden,
    defaultsApplied,
  };
}

/**
 * Compute the defaults each provider would apply, given the cross-provider
 * opts. Kept in sync with the provider implementations — if you add a default
 * to grok.ts or nova3.ts, mirror it here.
 */
function computeDefaults(
  provider: ProviderName,
  opts: DiarizationOpts,
): Record<string, unknown> {
  switch (provider) {
    case "grok": {
      const d: Record<string, unknown> = { diarize: true };
      if (opts.language && opts.language !== "multi") {
        d.language = opts.language.split("-")[0]!.toLowerCase();
      }
      if (opts.vocabulary && opts.vocabulary.length > 0) {
        d.keyterm = opts.vocabulary;
      }
      return d;
    }

    case "workers-ai-nova3": {
      const d: Record<string, unknown> = {
        diarize:      true,
        punctuate:    true,
        smart_format: true,
        language:     opts.language ?? "en-US",
      };
      if (opts.vocabulary && opts.vocabulary.length > 0) {
        d.keyterm = opts.vocabulary.join(",");
      }
      return d;
    }

    case "deepgram-direct":
      // Not yet implemented — mirror when adding the provider
      return {};
  }
}