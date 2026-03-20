// src/lib/tiers.ts
import { env } from "cloudflare:workers";

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
    label: "Pro", monthlyPrice: 8, stripe: () => env.STRIPE_PRO_PRICE_ID,
    plugins: {
      transcription: { enabled: true, model: MODEL, capMinutes: 600, trialCapMinutes: 0, sampleMaxSeconds: 0 },
      recording:     { enabled: false, resolution: "1080p" as const, maxPeerHoursTotal: 0, maxPeerHoursPerMonth: 0 },
      rooms:         { maxPeers: 6 },
    },
  },

  creator: {
    label: "Creator", monthlyPrice: 20, stripe: () => env.STRIPE_CREATOR_PRICE_ID,
    plugins: {
      transcription: { enabled: true, model: MODEL, capMinutes: 2000, trialCapMinutes: 0, sampleMaxSeconds: 0 },
      recording:     { enabled: true, resolution: "1080p" as const, maxPeerHoursTotal: 200, maxPeerHoursPerMonth: 50 },
      rooms:         { maxPeers: 10 },
    },
  },

  recording: {
    label: "Recording Storage", monthlyPrice: 3, stripe: () => env.STRIPE_RECORDING_PRICE_ID,
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

export function getTier(tier: string): typeof TIERS[TierKey] {
  return TIERS[tier as TierKey] ?? TIERS.free;
}

export function getTierPlugins(tier: string) {
  return getTier(tier).plugins;
}

export function isUnlimited(cap: number): boolean {
  return cap === 0;
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

export function getTierFromStripePrice(priceId: string): TierKey {
  if (priceId === env.STRIPE_PRO_PRICE_ID)       return "pro";
  if (priceId === env.STRIPE_CREATOR_PRICE_ID)   return "creator";
  if (priceId === env.STRIPE_RECORDING_PRICE_ID) return "recording";
  return "free";
}