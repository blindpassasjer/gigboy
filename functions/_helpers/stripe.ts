/// <reference types="@cloudflare/workers-types" />
import Stripe from 'stripe';
import { setFirestoreDocument } from './firebase-admin';

// Storage quotas mirrored from src/lib/planLimits.ts (can't import front-end modules here)
const STORAGE_QUOTA: Record<string, number> = {
  free: 100 * 1024 * 1024,          // 100 MB
  pro: 1024 * 1024 * 1024,          // 1 GB
  band: 5 * 1024 * 1024 * 1024,     // 5 GB
};

const BASE_MEMBER_LIMIT: Record<string, number> = {
  free: 1,
  pro: 1,
  band: 5,
};

const MAX_EXTRA_MEMBERS = 500;

export function getStripeClient(secretKey: string): Stripe {
  return new Stripe(secretKey, {
    // @ts-expect-error — Cloudflare Workers edge runtime
    apiVersion: '2025-03-31.basil',
    httpClient: Stripe.createFetchHttpClient(),
  });
}

export type PlanTier = 'free' | 'pro' | 'band';
export type SubscriptionStatus =
  | 'active' | 'trialing' | 'past_due' | 'canceled' | 'unpaid' | 'incomplete' | null;

export interface UpdatePlanPayload {
  plan: PlanTier;
  subscriptionStatus: SubscriptionStatus;
  currentPeriodEnd: number | null;
  stripeCustomerId: string | null;
  bandExtraMembers?: number;
  planOverride?: boolean;
}

/**
 * Writes subscription plan data to the user's Firestore profile.
 * Only called from trusted server-side code (webhook or admin override).
 */
export async function updateUserPlan(
  env: Record<string, string | undefined>,
  userId: string,
  payload: UpdatePlanPayload
): Promise<void> {
  const storageQuotaBytes = STORAGE_QUOTA[payload.plan] ?? STORAGE_QUOTA.free;
  const normalizedExtraMembers = payload.plan === 'band'
    ? Math.max(0, Math.min(MAX_EXTRA_MEMBERS, Math.trunc(payload.bandExtraMembers ?? 0)))
    : 0;
  const memberLimit = (BASE_MEMBER_LIMIT[payload.plan] ?? BASE_MEMBER_LIMIT.free) + normalizedExtraMembers;

  await setFirestoreDocument(env, ['users', userId], {
    plan: payload.plan,
    subscriptionStatus: payload.subscriptionStatus,
    currentPeriodEnd: payload.currentPeriodEnd,
    storageQuotaBytes,
    bandExtraMembers: normalizedExtraMembers,
    memberLimit,
    ...(payload.stripeCustomerId !== null ? { stripeCustomerId: payload.stripeCustomerId } : {}),
    ...(typeof payload.planOverride === 'boolean' ? { planOverride: payload.planOverride } : {}),
  });
}

/**
 * Derives a PlanTier from a Stripe price ID using wrangler env vars.
 * Env vars: STRIPE_PRO_MONTHLY_PRICE_ID, STRIPE_PRO_ANNUAL_PRICE_ID,
 *           STRIPE_BAND_MONTHLY_PRICE_ID, STRIPE_BAND_ANNUAL_PRICE_ID
 */
export function planTierFromPriceId(
  priceId: string,
  env: Record<string, string | undefined>
): PlanTier {
  const proPrices = [
    env.STRIPE_PRO_MONTHLY_PRICE_ID,
    env.STRIPE_PRO_ANNUAL_PRICE_ID,
  ].filter(Boolean);
  const bandPrices = [
    env.STRIPE_BAND_MONTHLY_PRICE_ID,
    env.STRIPE_BAND_ANNUAL_PRICE_ID,
  ].filter(Boolean);

  if (proPrices.includes(priceId)) return 'pro';
  if (bandPrices.includes(priceId)) return 'band';
  return 'free';
}

/**
 * Maps a Stripe subscription status string to our SubscriptionStatus union.
 */
export function mapStripeStatus(status: string): SubscriptionStatus {
  const allowed: SubscriptionStatus[] = [
    'active', 'trialing', 'past_due', 'canceled', 'unpaid', 'incomplete',
  ];
  return (allowed as string[]).includes(status) ? (status as SubscriptionStatus) : null;
}

export function planAndExtraMembersFromSubscription(
  subscription: Stripe.Subscription,
  env: Record<string, string | undefined>
): { plan: PlanTier; bandExtraMembers: number } {
  const proPrices = new Set([
    env.STRIPE_PRO_MONTHLY_PRICE_ID,
    env.STRIPE_PRO_ANNUAL_PRICE_ID,
  ].filter((entry): entry is string => Boolean(entry)));

  const bandPrices = new Set([
    env.STRIPE_BAND_MONTHLY_PRICE_ID,
    env.STRIPE_BAND_ANNUAL_PRICE_ID,
  ].filter((entry): entry is string => Boolean(entry)));

  const bandExtraMemberPrices = new Set([
    env.STRIPE_BAND_MONTHLY_EXTRA_MEMBER_PRICE_ID,
    env.STRIPE_BAND_ANNUAL_EXTRA_MEMBER_PRICE_ID,
  ].filter((entry): entry is string => Boolean(entry)));

  let plan: PlanTier = 'free';
  let bandExtraMembers = 0;

  for (const item of subscription.items.data) {
    const priceId = item.price?.id ?? '';
    const quantity = Math.max(0, item.quantity ?? 0);
    if (!priceId) continue;

    if (bandPrices.has(priceId)) {
      plan = 'band';
      continue;
    }

    if (proPrices.has(priceId) && plan !== 'band') {
      plan = 'pro';
      continue;
    }

    if (bandExtraMemberPrices.has(priceId)) {
      bandExtraMembers += quantity;
    }
  }

  if (plan !== 'band') {
    bandExtraMembers = 0;
  }

  return {
    plan,
    bandExtraMembers: Math.min(MAX_EXTRA_MEMBERS, bandExtraMembers),
  };
}
