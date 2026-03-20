// app/api/webhooks/stripe-wh.ts
import { getStripe } from '@/app/lib/stripe/client'
import { STRIPE_CONFIG, getTierFromPriceId } from '@/app/lib/stripe/config'
import { getTierPlugins, TIERS } from '@/lib/tiers'
import type { TierKey } from '@/lib/tiers'
import { db } from '@/db'
import type Stripe from 'stripe'

export default async function handler({ request }: { request: Request }) {
  const stripe    = getStripe()
  const signature = request.headers.get('stripe-signature')
  if (!signature) return new Response('Missing signature', { status: 400 })

  const body = await request.text()
  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(body, signature, STRIPE_CONFIG.webhookSecret)
  } catch (err) {
    console.error('Webhook signature failed:', err)
    return new Response('Invalid signature', { status: 400 })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutComplete(event.data.object as Stripe.Checkout.Session)
        break
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionUpdate(event.data.object as Stripe.Subscription)
        break
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription)
        break
      case 'invoice.payment_succeeded':
        await handlePaymentSucceeded(event.data.object as Stripe.Invoice)
        break
      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object as Stripe.Invoice)
        break
    }
    return new Response('OK', { status: 200 })
  } catch (err) {
    console.error('Webhook handler error:', err)
    return new Response('Webhook error', { status: 500 })
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getOrgForUser(userId: string): Promise<string | null> {
  const member = await db.member.findFirst({
    where:   { userId },
    select:  { organizationId: true },
    orderBy: { createdAt: 'asc' },
  })
  return member?.organizationId ?? null
}

// ── Core: upsert all plugin rows for a tier ───────────────────────────────────
// Reads plugin configs from tiers.ts — single source of truth.
// Each key in tier.plugins = one OrgPlugin row upserted.

async function upsertTierPlugins(
  organizationId: string,
  tierKey: TierKey,
  mode: 'active' | 'sample' | 'disabled' = 'active'
): Promise<void> {
  const plugins = getTierPlugins(tierKey) as Record<string, any>

  await Promise.all(
    Object.entries(plugins).map(([plugin, config]) => {
      if (!config || typeof config !== 'object') return Promise.resolve()

      // rooms is not a plugin row — skip it
      if (plugin === 'rooms') return Promise.resolve()

      const enabled = mode === 'active' && (config.enabled ?? false)
      const configBlob = JSON.stringify(config)

      return db.orgPlugin.upsert({
        where:  { organizationId_plugin: { organizationId, plugin } },
        create: { organizationId, plugin, enabled, mode, tier: tierKey, config: configBlob },
        update: { enabled, mode, tier: tierKey, config: configBlob },
      })
    })
  )

  console.log(`✅ plugins upserted: ${organizationId} → ${tierKey} (${mode})`)
}

// ── Deactivate all plugins → back to free defaults ────────────────────────────

async function deactivateAllPlugins(organizationId: string): Promise<void> {
  await upsertTierPlugins(organizationId, 'free', 'disabled')
  console.log(`🚫 plugins disabled: ${organizationId}`)
}

// ── Event handlers ────────────────────────────────────────────────────────────

async function handleCheckoutComplete(session: Stripe.Checkout.Session) {
  console.log(`✅ Checkout completed: ${session.metadata?.userId}`)
}

async function handleSubscriptionUpdate(subscription: Stripe.Subscription) {
  const userId = subscription.metadata?.userId
  if (!userId) {
    console.error('No userId in subscription metadata')
    return
  }

  const organizationId = await getOrgForUser(userId)
  if (!organizationId) {
    console.error(`No org found for userId ${userId}`)
    return
  }

  const isActive = subscription.status === 'active' || subscription.status === 'trialing'

  // Each line item may be a different tier/addon — handle all
  for (const item of subscription.items.data) {
    const priceId = item.price.id
    const tierKey = getTierFromPriceId(priceId)

    // Only base subscription items update stripeSubscription row
    // Addon tier keys (e.g. "recording") don't touch the subscription table
    const isBaseTier = tierKey === 'pro' || tierKey === 'creator' || tierKey === 'free'

    if (isBaseTier) {
      await db.stripeSubscription.upsert({
        where:  { userId },
        create: {
          userId,
          tier:                 tierKey,
          status:               subscription.status,
          stripeSubscriptionId: subscription.id,
          stripeCustomerId:     subscription.customer as string,
          stripePriceId:        priceId,
          currentPeriodStart:   new Date((subscription as any).current_period_start * 1000),
          currentPeriodEnd:     new Date((subscription as any).current_period_end   * 1000),
          cancelAtPeriodEnd:    subscription.cancel_at_period_end,
          metadata:             JSON.stringify(subscription),
        },
        update: {
          tier:               tierKey,
          status:             subscription.status,
          stripePriceId:      priceId,
          currentPeriodStart: new Date((subscription as any).current_period_start * 1000),
          currentPeriodEnd:   new Date((subscription as any).current_period_end   * 1000),
          cancelAtPeriodEnd:  subscription.cancel_at_period_end,
          canceledAt:         subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : null,
          metadata:           JSON.stringify(subscription),
        },
      })
    }

    // Upsert plugin rows for this tier/addon
    if (isActive) {
      await upsertTierPlugins(organizationId, tierKey, 'active')
    }
  }
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const record = await db.stripeSubscription.findFirst({
    where:  { stripeSubscriptionId: subscription.id },
    select: { userId: true },
  })

  await db.stripeSubscription.updateMany({
    where: { stripeSubscriptionId: subscription.id },
    data:  { status: 'canceled', tier: 'free' },
  })

  if (record?.userId) {
    const organizationId = await getOrgForUser(record.userId)
    if (organizationId) await deactivateAllPlugins(organizationId)
  }
}

async function handlePaymentSucceeded(invoice: Stripe.Invoice) {
  const subscriptionId = (invoice as any).subscription as string
  if (!subscriptionId) return
  await db.stripeSubscription.updateMany({
    where: { stripeSubscriptionId: subscriptionId },
    data:  { status: 'active' },
  })
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  const subscriptionId = (invoice as any).subscription as string
  if (!subscriptionId) return
  await db.stripeSubscription.updateMany({
    where: { stripeSubscriptionId: subscriptionId },
    data:  { status: 'past_due' },
  })
  console.log(`⚠️ Payment failed: ${subscriptionId}`)
}