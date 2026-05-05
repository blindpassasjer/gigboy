/// <reference types="@cloudflare/workers-types" />
import Stripe from 'stripe';
import { setFirestoreDocument } from './firebase-admin';

// Storage quotas mirrored from src/lib/planLimits.ts (can't import front-end modules here)
const STORAGE_QUOTA: Record<string, number> = {
  free: 100 * 1024 * 1024,          // 100 MB
  pro: 1024 * 1024 * 1024,          // 1 GB
  band: 5 * 1024 * 1024 * 1024,     // 5 GB
};

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
  await setFirestoreDocument(env, ['users', userId], {
    plan: payload.plan,
    subscriptionStatus: payload.subscriptionStatus,
    currentPeriodEnd: payload.currentPeriodEnd,
    storageQuotaBytes,
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
