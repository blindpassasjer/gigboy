/// <reference types="@cloudflare/workers-types" />
import { getFirestoreDocument, setFirestoreDocument } from '../../_helpers/firebase-admin';

interface Data extends Record<string, unknown> {
  userId?: string;
}

export const onRequestPost: PagesFunction<{ bandId: string }, never, Data> = async (ctx) => {
  try {
    const userId = ctx.data.userId;
    if (!userId) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const bandId = ctx.params.bandId;
    if (!bandId) {
      return Response.json({ error: 'Band ID is required.' }, { status: 400 });
    }

    const body = await ctx.request.json<{ name?: string }>();
    const name = body.name?.trim() ?? '';

    if (!name) {
      return Response.json({ error: 'Press kit name is required.' }, { status: 400 });
    }

    if (name.length > 150) {
      return Response.json({ error: 'Press kit name must be 150 characters or fewer.' }, { status: 400 });
    }

    // Get user profile to check plan
    const userProfile = await getFirestoreDocument(ctx.env, ['users', userId]);
    const userPlan = userProfile?.plan === 'pro' || userProfile?.plan === 'crew' ? userProfile.plan : 'free';
    const userSubscriptionStatus = userProfile?.subscriptionStatus;
    const userPlanOverride = userProfile?.planOverride === true;

    // Determine if user's plan is active
    const isUserPlanActive = userPlan === 'free' || userPlanOverride || userSubscriptionStatus === 'active' || userSubscriptionStatus === 'trialing';

    // Get band to check its plan (band plan can override user plan)
    const band = await getFirestoreDocument(ctx.env, ['bands', bandId]);
    if (!band) {
      return Response.json({ error: 'Band not found.' }, { status: 404 });
    }

    // Check if user is band owner or editor
    const isBandOwner = band.ownerId === userId;
    const isBandEditor = isBandOwner || (band.memberRoles?.[userId] === 'editor');
    if (!isBandEditor) {
      return Response.json({ error: 'You do not have permission to create press kits for this band.' }, { status: 403 });
    }

    // Determine effective plan (higher of user plan and band plan)
    const bandPlan = band.billingPlan === 'pro' || band.billingPlan === 'crew' ? band.billingPlan : 'free';
    const bandSubscriptionStatus = band.billingSubscriptionStatus;
    const isBandPlanActive = bandPlan === 'free' || bandSubscriptionStatus === 'active' || bandSubscriptionStatus === 'trialing';

    // Determine which plan to use
    let effectivePlan = userPlan;
    let effectiveActive = isUserPlanActive;

    if (bandPlan === 'pro' || bandPlan === 'crew') {
      if (isBandPlanActive) {
        effectivePlan = bandPlan;
        effectiveActive = true;
      }
    }

    // Press kits require Pro or Crew plan
    if (effectivePlan === 'free' || !effectiveActive) {
      return Response.json(
        { error: 'Press kits require a Pro or Crew plan. Upgrade to create press kits for this band.' },
        { status: 403 }
      );
    }

    // Create the press kit
    const kitId = crypto.randomUUID();
    const now = new Date().toISOString();

    await setFirestoreDocument(ctx.env, ['bands', bandId, 'pressKits', kitId], {
      name: name.trim(),
      richText: '',
      imageIds: [],
      videoUrls: [],
      selectedVideoUrls: [],
      createdAt: now,
      createdBy: userId,
    });

    return Response.json({ ok: true, kitId });
  } catch (error) {
    console.error('Error creating press kit:', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to create press kit.' },
      { status: 500 }
    );
  }
};
