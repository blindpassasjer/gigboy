import { useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { PLAN_FEATURE_ACCESS, PLAN_LABELS, PLAN_LIMITS, type ProFeature } from '../lib/planLimits';
import type { PlanTier } from '../types';

function isPlanActive(plan: PlanTier, subscriptionStatus: string | null, planOverride: boolean) {
  if (planOverride) return true;
  if (plan === 'free') return true;
  return subscriptionStatus === 'active' || subscriptionStatus === 'trialing';
}

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