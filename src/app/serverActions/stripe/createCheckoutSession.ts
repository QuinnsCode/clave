// app/serverActions/stripe/createCheckoutSession.ts
'use server'

import { getStripe } from '@/app/lib/stripe/client'
import { STRIPE_CONFIG, getStripePriceId, type PaidTier } from '@/app/lib/stripe/config'
import { db } from '@/db'

export async function createStripeCheckoutSession(
  userId: string,
  tier: PaidTier,
): Promise<{ url?: string; error?: string }> {
  try {
    const stripe = getStripe()

    const user = await db.user.findUnique({
      where:   { id: userId },
      include: { stripeSubscription: true },
    })

    if (!user) return { error: 'User not found' }

    // Get or create Stripe customer
    let customerId = user.stripeSubscription?.stripeCustomerId
    if (!customerId) {
      const customer = await stripe.customers.create({
        email:    user.email || undefined,
        metadata: { userId },
      })
      customerId = customer.id
    }

    const session = await stripe.checkout.sessions.create({
      customer:             customerId,
      mode:                 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: getStripePriceId(tier), quantity: 1 }],
      success_url: `${STRIPE_CONFIG.baseUrl}/dashboard?upgrade=success`,
      cancel_url:  `${STRIPE_CONFIG.baseUrl}/dashboard?upgrade=canceled`,
      metadata: { userId, tier },
      subscription_data: {
        metadata: { userId, tier }, // on subscription so renewal events have it
      },
    })

    return { url: session.url || undefined }
  } catch (err) {
    console.error('Stripe checkout error:', err)
    return { error: err instanceof Error ? err.message : 'Failed to create checkout session' }
  }
}