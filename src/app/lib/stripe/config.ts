// app/lib/stripe/config.ts
import { env } from 'cloudflare:workers'
import type { TierKey } from '@/lib/tiers'

export const STRIPE_CONFIG = {
  secretKey:     env.STRIPE_SECRET_KEY!,
  webhookSecret: env.STRIPE_WEBHOOK_SECRET!,
  prices: {
    pro:       env.STRIPE_PRO_PRICE_ID!,
    creator:   env.STRIPE_CREATOR_PRICE_ID!,
    recording: env.STRIPE_RECORDING_PRICE_ID!,
  },
  baseUrl: env.BETTER_AUTH_URL || 'https://qlave.dev',
} as const

export type PaidTier = 'pro' | 'creator'

export function getStripePriceId(tier: PaidTier): string {
  return STRIPE_CONFIG.prices[tier]
}

export function getTierFromPriceId(priceId: string): TierKey {
  if (env.STRIPE_PRO_PRICE_ID       && priceId === env.STRIPE_PRO_PRICE_ID)       return "pro";
  if (env.STRIPE_CREATOR_PRICE_ID   && priceId === env.STRIPE_CREATOR_PRICE_ID)   return "creator";
  if (env.STRIPE_RECORDING_PRICE_ID && priceId === env.STRIPE_RECORDING_PRICE_ID) return "recording";
  throw new Error(
    `Unknown Stripe price ID: ${priceId} — not configured in this deployment. ` +
    `Check STRIPE_PRO_PRICE_ID, STRIPE_CREATOR_PRICE_ID, STRIPE_RECORDING_PRICE_ID env vars.`
  );
}