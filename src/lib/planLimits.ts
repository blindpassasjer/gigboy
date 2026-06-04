import type { Band, PlanTier } from '../types';

export type ProFeature =
  | 'setlists'
  | 'technicalRiders'
  | 'pressKits'
  | 'shareableLinks'
  | 'bluetoothPedal'
  | 'recordings'
  | 'metronome'
  | 'multiUserNotes';

interface PlanLimits {
  songLimit: number | null;
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
    storageQuotaBytes: 100 * 1024 * 1024,
    memberLimit: 1,
  },
  pro: {
    songLimit: null,
    storageQuotaBytes: 1024 * 1024 * 1024,
    memberLimit: 1,
  },
  crew: {
    songLimit: null,
    storageQuotaBytes: 5 * 1024 * 1024 * 1024,
    memberLimit: 5,
  },
};

export const PLAN_FEATURE_ACCESS: Record<PlanTier, Record<ProFeature, boolean>> = {
  free: {
    setlists: false,
    technicalRiders: false,
    pressKits: false,
    shareableLinks: false,
    bluetoothPedal: false,
    recordings: false,
    metronome: false,
    multiUserNotes: false,
  },
  pro: {
    setlists: true,
    technicalRiders: true,
    pressKits: true,
    shareableLinks: true,
    bluetoothPedal: true,
    recordings: true,
    metronome: true,
    multiUserNotes: true,
  },
  crew: {
    setlists: true,
    technicalRiders: true,
    pressKits: true,
    shareableLinks: true,
    bluetoothPedal: true,
    recordings: true,
    metronome: true,
    multiUserNotes: true,
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

  if (!effectiveActive && effectivePlan !== 'free') return false;
  return PLAN_FEATURE_ACCESS[effectivePlan][feature];
}