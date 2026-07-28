import type { Band, PlanTier } from '../types';

export type ProFeature =
  | 'setlists'
  | 'technicalRiders'
  | 'pressKits'
  | 'shareableLinks'
  | 'recordings'
  | 'metronome'
  | 'multiUserNotes'
  | 'attachments';

interface PlanLimits {
  songLimit: number | null;
  setlistLimit: number | null;
  pressKitLimit: number | null;
  riderLimit: number | null;
  storageQuotaBytes: number;
  memberLimit: number;
}

export const PLAN_LABELS: Record<PlanTier, string> = {
  free: 'Free',
  pro: 'Pro',
  crew: 'Crew',
};

export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
  free: {
    songLimit: 12,
    setlistLimit: 1,
    pressKitLimit: 1,
    riderLimit: 1,
    storageQuotaBytes: 100 * 1024 * 1024,
    memberLimit: 1,
  },
  pro: {
    songLimit: null,
    setlistLimit: null,
    pressKitLimit: null,
    riderLimit: null,
    storageQuotaBytes: 1024 * 1024 * 1024,
    memberLimit: 1,
  },
  crew: {
    songLimit: null,
    setlistLimit: null,
    pressKitLimit: null,
    riderLimit: null,
    storageQuotaBytes: 5 * 1024 * 1024 * 1024,
    memberLimit: 5,
  },
};

export const PLAN_FEATURE_ACCESS: Record<PlanTier, Record<ProFeature, boolean>> = {
  free: {
    setlists: true,
    technicalRiders: true,
    pressKits: true,
    shareableLinks: false,
    recordings: false,
    metronome: false,
    multiUserNotes: false,
    attachments: false,
  },
  pro: {
    setlists: true,
    technicalRiders: true,
    pressKits: true,
    shareableLinks: true,
    recordings: true,
    metronome: true,
    multiUserNotes: true,
    attachments: true,
  },
  crew: {
    setlists: true,
    technicalRiders: true,
    pressKits: true,
    shareableLinks: true,
    recordings: true,
    metronome: true,
    multiUserNotes: true,
    attachments: true,
  },
};

function isBandPlanActive(plan: PlanTier, subscriptionStatus: string | null | undefined) {
  if (plan === 'free') return true;
  if (subscriptionStatus === 'active' || subscriptionStatus === 'trialing') return true;
  // Legacy/partial band billing snapshots may miss status while plan is already set.
  if (subscriptionStatus == null) return true;
  return false;
}

const PLAN_ORDER: Record<PlanTier, number> = { free: 0, pro: 1, crew: 2 };

/**
 * Resolves the plan a band should be evaluated against: the higher of the band's own
 * billing plan and the acting user's plan, provided whichever one wins is actually active.
 */
function resolveEffectivePlan(
  band: Band,
  userPlan: PlanTier = 'free',
  userSubscriptionStatus: string | null = null
): { effectivePlan: PlanTier; effectiveActive: boolean } {
  const bandPlan: PlanTier = band.billingPlan === 'pro' || band.billingPlan === 'crew'
    ? band.billingPlan
    : 'free';
  const bandActive = isBandPlanActive(bandPlan, band.billingSubscriptionStatus);

  const userActive = userPlan === 'free'
    || userSubscriptionStatus === 'active'
    || userSubscriptionStatus === 'trialing';

  const effectivePlan: PlanTier =
    (PLAN_ORDER[bandPlan] >= PLAN_ORDER[userPlan] && bandActive) ? bandPlan : userPlan;
  const effectiveActive = effectivePlan === bandPlan ? bandActive : userActive;

  return { effectivePlan, effectiveActive };
}

/**
 * Pure function: can the given feature be used in the context of a specific band?
 * Elevates to the user's plan when the band's billingPlan is a lower tier.
 * Pass planOverride: true to bypass all checks (admin/demo).
 */
export function bandCanUse(
  band: Band | null,
  feature: ProFeature,
  userPlan: PlanTier = 'free',
  userSubscriptionStatus: string | null = null,
  planOverride = false
): boolean {
  if (planOverride) return true;
  if (!band) return false;

  const { effectivePlan, effectiveActive } = resolveEffectivePlan(band, userPlan, userSubscriptionStatus);

  if (!effectiveActive && effectivePlan !== 'free') return false;
  return PLAN_FEATURE_ACCESS[effectivePlan][feature];
}

/**
 * Resolves the count limit for a plan-limited resource (setlists, press kits, riders),
 * elevating to the band's plan when it's active and at least as high as the user's.
 */
export function resolveResourceLimit(
  band: Band,
  limitKey: 'setlistLimit' | 'pressKitLimit' | 'riderLimit',
  userPlan: PlanTier = 'free',
  userSubscriptionStatus: string | null = null,
  planOverride = false
): number | null {
  if (planOverride) return null;
  const { effectivePlan, effectiveActive } = resolveEffectivePlan(band, userPlan, userSubscriptionStatus);
  return effectiveActive ? PLAN_LIMITS[effectivePlan][limitKey] : PLAN_LIMITS.free[limitKey];
}