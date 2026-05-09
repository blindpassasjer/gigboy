/// <reference types="@cloudflare/workers-types" />
import { getFirestoreDocument } from './firebase-admin';

const MAX_EXTRA_MEMBERS = 500;
const CREW_OVERRIDE_USERNAMES = new Set(['sebastian']);

type PlanTier = 'free' | 'pro' | 'crew';
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
  return value === 'pro' || value === 'crew' ? value : 'free';
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

function hasCrewTierOverride(profile: Record<string, unknown> | null): boolean {
  if (!profile) return false;
  const usernameLower = typeof profile.usernameLower === 'string'
    ? profile.usernameLower.trim().toLowerCase()
    : (typeof profile.username === 'string' ? profile.username.trim().toLowerCase() : '');
  return CREW_OVERRIDE_USERNAMES.has(usernameLower);
}

export async function resolveOwnerBandMemberLimit(
  env: Record<string, string | undefined>,
  ownerId: string,
  bandId: string
): Promise<OwnerBandLimit> {
  const bandDoc = await getFirestoreDocument(env, ['bands', bandId]);
  const bandStatus = toSubscriptionStatus(bandDoc?.billingSubscriptionStatus);
  const bandPlan = bandDoc?.billingPlan === 'crew' ? 'crew' : bandDoc?.billingPlan === 'pro' ? 'pro' : 'free';
  const bandActive = isPlanActive(bandPlan, bandStatus, false);

  // Crew band: member invites allowed
  if (bandPlan === 'crew' && bandActive) {
    const extraMembers = toSafeExtraMembers(bandDoc?.billingExtraMembers);
    const storedLimit = typeof bandDoc?.billingMemberLimit === 'number'
      ? Math.max(1, Math.trunc(bandDoc.billingMemberLimit))
      : 5 + extraMembers;
    return {
      memberLimit: Math.max(storedLimit, 5 + extraMembers),
      isBandEligible: true,
      extraMembers,
    };
  }

  // Pro band: all features but no member invites
  if (bandPlan === 'pro' && bandActive) {
    return {
      memberLimit: 1,
      isBandEligible: false,
      extraMembers: 0,
    };
  }

  const ownerProfile = await getFirestoreDocument(env, ['users', ownerId]);
  const crewTierOverride = hasCrewTierOverride(ownerProfile);
  const plan = crewTierOverride ? 'crew' : toPlanTier(ownerProfile?.plan);
  const subscriptionStatus = toSubscriptionStatus(ownerProfile?.subscriptionStatus);
  const planOverride = crewTierOverride || ownerProfile?.planOverride === true;
  const active = isPlanActive(plan, subscriptionStatus, planOverride);

  if (plan !== 'crew' || !active) {
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
