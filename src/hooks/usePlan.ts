import { useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { PLAN_FEATURE_ACCESS, PLAN_LABELS, PLAN_LIMITS, type ProFeature } from '../lib/planLimits';
import type { Band, PlanTier } from '../types';
import type { UserProfile } from '../lib/userProfiles';

function isPlanActive(plan: PlanTier, subscriptionStatus: string | null, planOverride: boolean) {
  if (planOverride) return true;
  if (plan === 'free') return true;
  return subscriptionStatus === 'active' || subscriptionStatus === 'trialing';
}

function isBandPlanActive(plan: PlanTier, subscriptionStatus: string | null) {
  if (plan === 'free') return true;
  if (subscriptionStatus === 'active' || subscriptionStatus === 'trialing') return true;
  // Legacy/partial band billing snapshots may miss status while plan is already set.
  if (subscriptionStatus == null) return true;
  return false;
}

const isSelfHost = import.meta.env.VITE_BACKEND === 'selfhost';

export function usePlan() {
  const { user } = useAuth();

  return useMemo(() => {
    // Self-host builds have no Stripe/plan gating: every feature is unlocked,
    // equivalent to today's `crew` tier with unlimited limits.
    if (isSelfHost) {
      const limits = PLAN_LIMITS.crew;
      return {
        plan: 'crew' as PlanTier,
        planLabel: PLAN_LABELS.crew,
        isActive: true,
        isFree: false,
        isPro: true,
        isCrew: true,
        planOverride: true,
        subscriptionStatus: null,
        songLimit: limits.songLimit,
        storageQuotaBytes: limits.storageQuotaBytes,
        memberLimit: limits.memberLimit,
        canUse() {
          return true;
        },
      };
    }

    const plan = user?.plan ?? 'free';
    const planOverride = user?.planOverride === true;
    const subscriptionStatus = user?.subscriptionStatus ?? null;
    const active = isPlanActive(plan, subscriptionStatus, planOverride);
    const limits = PLAN_LIMITS[plan];
    const effectiveMemberLimit = Math.max(user?.memberLimit ?? 0, limits.memberLimit);

    return {
      plan,
      planLabel: PLAN_LABELS[plan],
      isActive: active,
      isFree: plan === 'free',
      isPro: active && (plan === 'pro' || plan === 'crew'),
      isCrew: active && plan === 'crew',
      planOverride,
      subscriptionStatus,
      songLimit: limits.songLimit,
      storageQuotaBytes: Math.max(user?.storageQuotaBytes ?? 0, limits.storageQuotaBytes),
      memberLimit: effectiveMemberLimit,
      canUse(feature: ProFeature) {
        if (planOverride) return true;
        if (!active && plan !== 'free') return false;
        return PLAN_FEATURE_ACCESS[plan][feature];
      },
    };
  }, [user]);
}

const PLAN_ORDER: Record<PlanTier, number> = { free: 0, pro: 1, crew: 2 };

/**
 * Pure computation of effective plan state for a band, given a user snapshot.
 * Shared by useBandPlan and by call sites that need this for several bands at
 * once (e.g. a band list), where calling the hook per-item isn't an option.
 */
export function computeBandPlan(band: Band | null, user: Pick<UserProfile, 'plan' | 'planOverride' | 'subscriptionStatus'> | null | undefined) {
  if (isSelfHost) {
    const limits = PLAN_LIMITS.crew;
    return {
      plan: 'crew' as PlanTier,
      planLabel: PLAN_LABELS.crew,
      isActive: true,
      isFree: false,
      isPro: true,
      isCrew: true,
      planOverride: true,
      subscriptionStatus: null,
      songLimit: limits.songLimit,
      storageQuotaBytes: limits.storageQuotaBytes,
      memberLimit: limits.memberLimit,
      canUse() {
        return true;
      },
    };
  }

  const userPlan: PlanTier = user?.plan ?? 'free';
  const planOverride = user?.planOverride === true;
  const bandPlan: PlanTier = band?.billingPlan === 'pro' || band?.billingPlan === 'crew'
    ? band.billingPlan
    : 'free';
  const bandStatus = band?.billingSubscriptionStatus ?? null;
  const bandPlanActive = isBandPlanActive(bandPlan, bandStatus);

  const effectivePlan: PlanTier = (PLAN_ORDER[bandPlan] >= PLAN_ORDER[userPlan] && bandPlanActive)
    ? bandPlan
    : userPlan;
  const userActive = isPlanActive(userPlan, user?.subscriptionStatus ?? null, planOverride);
  const effectiveActive = effectivePlan === 'free' || (effectivePlan === bandPlan ? bandPlanActive : userActive);
  const limits = PLAN_LIMITS[effectivePlan];

  return {
    plan: effectivePlan,
    planLabel: PLAN_LABELS[effectivePlan],
    isActive: effectiveActive,
    isFree: effectivePlan === 'free',
    isPro: effectiveActive && (effectivePlan === 'pro' || effectivePlan === 'crew'),
    isCrew: effectiveActive && effectivePlan === 'crew',
    planOverride,
    subscriptionStatus: bandStatus,
    songLimit: limits.songLimit,
    storageQuotaBytes: limits.storageQuotaBytes,
    memberLimit: limits.memberLimit,
    canUse(feature: ProFeature) {
      if (planOverride) return true;
      if (!effectiveActive) return false;
      return PLAN_FEATURE_ACCESS[effectivePlan][feature];
    },
  };
}

/**
 * Returns effective plan state for a specific band workspace.
 * Elevates to the user's plan when the band's billingPlan is a lower tier.
 */
export function useBandPlan(band: Band | null) {
  const { user } = useAuth();
  return useMemo(() => computeBandPlan(band, user), [band, user]);
}