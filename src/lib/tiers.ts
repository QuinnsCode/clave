// src/lib/tiers.ts
// Single source of truth for tier names and configs.
// SAFE to import from anywhere (client or server) — no cloudflare:workers,
// no env access. Stripe price ID resolution lives in app/lib/stripe/config.ts.

const MODEL = "whisper-large-v3-turbo";

export const DEFAULTS = {
  transcription: { enabled: false, model: MODEL, capMinutes: 0, trialCapMinutes: 0, sampleMaxSeconds: 0 },
  recording:     { enabled: false, resolution: "720p" as const, maxPeerHoursTotal: 0, maxPeerHoursPerMonth: 0 },
  rooms:         { maxPeers: 2 },
} as const;

export const TIERS = {

  free: {
    label: "Free", monthlyPrice: 0, stripe: null,
    plugins: {
      transcription: { enabled: false, model: MODEL, capMinutes: 10, trialCapMinutes: 0, sampleMaxSeconds: 300 },
      recording:     { enabled: false, resolution: "720p" as const, maxPeerHoursTotal: 0, maxPeerHoursPerMonth: 0 },
      rooms:         { maxPeers: 4 },
    },
  },

  trial: {
    label: "Trial", monthlyPrice: 0, stripe: null,
    plugins: {
      transcription: { enabled: true, model: MODEL, capMinutes: 0, trialCapMinutes: 120, sampleMaxSeconds: 300 },
      recording:     { enabled: true, resolution: "720p" as const, maxPeerHoursTotal: 5, maxPeerHoursPerMonth: 5 },
      rooms:         { maxPeers: 4 },
    },
  },

  pro: {
    label: "Pro", monthlyPrice: 8, stripe: "pro" as const,
    plugins: {
      transcription: { enabled: true, model: MODEL, capMinutes: 600, trialCapMinutes: 0, sampleMaxSeconds: 0 },
      recording:     { enabled: false, resolution: "1080p" as const, maxPeerHoursTotal: 0, maxPeerHoursPerMonth: 0 },
      rooms:         { maxPeers: 6 },
    },
  },

  creator: {
    label: "Creator", monthlyPrice: 20, stripe: "creator" as const,
    plugins: {
      transcription: { enabled: true, model: MODEL, capMinutes: 2000, trialCapMinutes: 0, sampleMaxSeconds: 0 },
      recording:     { enabled: true, resolution: "1080p" as const, maxPeerHoursTotal: 200, maxPeerHoursPerMonth: 50 },
      rooms:         { maxPeers: 10 },
    },
  },

  recording: {
    label: "Recording Storage", monthlyPrice: 3, stripe: "recording" as const,
    plugins: {
      recording: { enabled: true, resolution: "1080p" as const, maxPeerHoursTotal: 100, maxPeerHoursPerMonth: 30 },
    },
  },

  founder: {
    label: "Founder", monthlyPrice: 0, stripe: null,
    plugins: {
      transcription: { enabled: true, model: MODEL, capMinutes: 999999, trialCapMinutes: 0, sampleMaxSeconds: 0 },
      recording:     { enabled: true, resolution: "1080p" as const, maxPeerHoursTotal: 999, maxPeerHoursPerMonth: 998 },
      rooms:         { maxPeers: 12 },
    },
  },

} as const;

export type TierKey = keyof typeof TIERS;

export const ALL_TIER_KEYS = Object.keys(TIERS) as TierKey[];

export const STRIPE_TIER_KEYS = ["pro", "creator", "recording"] as const;
export type StripeTier = typeof STRIPE_TIER_KEYS[number];

export const ADMIN_GRANTABLE_KEYS = ["free", "pro", "creator"] as const;
export type AdminGrantableTier = typeof ADMIN_GRANTABLE_KEYS[number];

export function getTier(tier: string): typeof TIERS[TierKey] {
  return TIERS[tier as TierKey] ?? TIERS.free;
}

export function getTierPlugins(tier: string) {
  return getTier(tier).plugins;
}

export function isUnlimited(cap: number): boolean {
  return cap === 0;
}

// True iff this tier has a Stripe product associated with it.
// Doesn't check that the env var is actually set — that's a deployment
// concern, handled in app/lib/stripe/config.ts.
export function isPurchasable(tier: TierKey): boolean {
  return (STRIPE_TIER_KEYS as readonly string[]).includes(tier);
}

export function getPurchasableTiers(): TierKey[] {
  return ALL_TIER_KEYS.filter(isPurchasable);
}

export interface RecordingConfig {
  resolution:           "720p" | "1080p" | "4k";
  maxPeerHoursTotal:    number;
  maxPeerHoursPerMonth: number;
  hardCapTB?:           number;
  overageEnabled?:      boolean;
}

export function getDefaultRecordingConfig(tier: string): RecordingConfig {
  const rec = (getTierPlugins(tier) as any).recording;
  return {
    resolution:           rec?.resolution           ?? DEFAULTS.recording.resolution,
    maxPeerHoursTotal:    rec?.maxPeerHoursTotal    ?? 0,
    maxPeerHoursPerMonth: rec?.maxPeerHoursPerMonth ?? 0,
  };
}

export function normalizeTier(raw: string | null | undefined): TierKey {
  if (!raw) return "free";
  if ((ALL_TIER_KEYS as readonly string[]).includes(raw)) return raw as TierKey;

  const aliases: Record<string, TierKey> = {
    basic:      "free",
    starter:    "free",
    scale:      "creator",
    enterprise: "creator",
    unlimited:  "founder",
  };
  return aliases[raw] ?? "free";
}