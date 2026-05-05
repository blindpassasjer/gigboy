/// <reference types="@cloudflare/workers-types" />
import { updateUserPlan } from '../../_helpers/stripe';
import type { PlanTier, SubscriptionStatus } from '../../_helpers/stripe';

interface Env {
  FIREBASE_PROJECT_ID?: string;
  FIREBASE_PRIVATE_KEY?: string;
  FIREBASE_CLIENT_EMAIL?: string;
  /** Comma-separated Firebase UIDs that are allowed to call this endpoint. */
  ADMIN_UIDS?: string;
}

interface Data extends Record<string, unknown> {
  userId?: string;
}

export const onRequestPost: PagesFunction<Env, never, Data> = async (ctx) => {
  const userId = ctx.data.userId;
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const adminUids = (ctx.env.ADMIN_UIDS ?? '')
    .split(',')
    .map((uid) => uid.trim())
    .filter(Boolean);

  if (!adminUids.includes(userId)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await ctx.request.json<{
    targetUserId?: string;
    plan?: string;
    planOverride?: boolean;
  }>().catch(() => null);

  if (!body?.targetUserId || !body?.plan) {
    return Response.json({ error: 'Missing targetUserId or plan.' }, { status: 400 });
  }

  const validPlans: PlanTier[] = ['free', 'pro', 'band'];
  if (!validPlans.includes(body.plan as PlanTier)) {
    return Response.json({ error: 'Invalid plan value.' }, { status: 400 });
  }

  const plan = body.plan as PlanTier;
  const planOverride = body.planOverride !== false; // defaults to true when not specified

  await updateUserPlan(ctx.env as unknown as Record<string, string | undefined>, body.targetUserId, {
    plan,
    planOverride,
    subscriptionStatus: plan === 'free' ? null : ('active' as SubscriptionStatus),
    currentPeriodEnd: null,
    stripeCustomerId: null,
  });

  return Response.json({ ok: true, targetUserId: body.targetUserId, plan, planOverride });
};
