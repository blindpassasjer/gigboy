/// <reference types="@cloudflare/workers-types" />
import { getFirestoreDocument } from './firebase-admin';

const MAX_EXTRA_MEMBERS = 500;

type PlanTier = 'free' | 'pro' | 'band';
type SubscriptionStatus =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'canceled'
  | 'unpaid'
  | 'incomplete'
  | null;

interface OwnerBandLimit {
  memberLimit: number;
  isBandEligible: boolean;
  extraMembers: number;
}

function toPlanTier(value: unknown): PlanTier {
  return value === 'pro' || value === 'band' ? value : 'free';
}

function toSubscriptionStatus(value: unknown): SubscriptionStatus {
  return value === 'active'
    || value === 'trialing'
    || value === 'past_due'
    || value === 'canceled'
    || value === 'unpaid'
    || value === 'incomplete'
    ? value
    : null;
}

function toSafeExtraMembers(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  const normalized = Math.trunc(value);
  if (normalized < 0) return 0;
  return Math.min(normalized, MAX_EXTRA_MEMBERS);
}

function isPlanActive(plan: PlanTier, subscriptionStatus: SubscriptionStatus, planOverride: boolean): boolean {
  if (planOverride) return true;
  if (plan === 'free') return true;
  return subscriptionStatus === 'active' || subscriptionStatus === 'trialing';
}

export async function resolveOwnerBandMemberLimit(
  env: Record<string, string | undefined>,
  ownerId: string
): Promise<OwnerBandLimit> {
  const ownerProfile = await getFirestoreDocument(env, ['users', ownerId]);
  const plan = toPlanTier(ownerProfile?.plan);
  const subscriptionStatus = toSubscriptionStatus(ownerProfile?.subscriptionStatus);
  const planOverride = ownerProfile?.planOverride === true;
  const active = isPlanActive(plan, subscriptionStatus, planOverride);

  if (plan !== 'band' || !active) {
    return {
      memberLimit: 1,
      isBandEligible: false,
      extraMembers: 0,
    };
  }

  const extraMembers = toSafeExtraMembers(ownerProfile?.bandExtraMembers);
  return {
    memberLimit: 5 + extraMembers,
    isBandEligible: true,
    extraMembers,
  };
}
