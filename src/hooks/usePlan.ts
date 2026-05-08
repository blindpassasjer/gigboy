import { useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { PLAN_FEATURE_ACCESS, PLAN_LABELS, PLAN_LIMITS, type ProFeature } from '../lib/planLimits';
import type { Band, PlanTier } from '../types';

function isPlanActive(plan: PlanTier, subscriptionStatus: string | null, planOverride: boolean) {
  if (planOverride) return true;
  if (plan === 'free') return true;
  return subscriptionStatus === 'active' || subscriptionStatus === 'trialing';
}

const PLAN_ORDER: Record<PlanTier, number> = { free: 0, pro: 1, crew: 2 };

export function usePlan() {
  const { user } = useAuth();

  return useMemo(() => {
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

/**
 * Returns effective plan state for a specific band workspace.
 * Elevates the user's plan to the band's billingPlan when the band has a higher tier.
 */
export function useBandPlan(band: Band | null) {
  const { user } = useAuth();

  return useMemo(() => {
    const userPlan: PlanTier = user?.plan ?? 'free';
    const planOverride = user?.planOverride === true;
    const bandPlan: PlanTier = band?.billingPlan === 'pro' || band?.billingPlan === 'crew'
      ? band.billingPlan
      : 'free';
    const bandStatus = band?.billingSubscriptionStatus ?? null;
    const bandPlanActive = bandPlan === 'free' || bandStatus === 'active' || bandStatus === 'trialing';

    // Effective plan = highest of user plan and band plan
    const effectivePlan: PlanTier = (PLAN_ORDER[bandPlan] >= PLAN_ORDER[userPlan] && bandPlanActive)
      ? bandPlan
      : userPlan;
    const userActive = isPlanActive(userPlan, user?.subscriptionStatus ?? null, planOverride);
    const effectiveActive = effectivePlan === 'free' || (effectivePlan === bandPlan ? bandPlanActive : userActive);

    return {
      plan: effectivePlan,
      isCrew: effectivePlan === 'crew' && effectiveActive,
      canUse(feature: ProFeature): boolean {
        if (planOverride) return true;
        if (!effectiveActive && effectivePlan !== 'free') return false;
        return PLAN_FEATURE_ACCESS[effectivePlan][feature];
      },
    };
  }, [band, user]);
}