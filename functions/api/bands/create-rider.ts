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

    const body = await ctx.request.json<{ bandId?: string; name?: string }>();
    const bandId = body.bandId?.trim() || ctx.params.bandId;
    if (!bandId) {
      return Response.json({ error: 'Band ID is required.' }, { status: 400 });
    }

    const name = body.name?.trim() ?? '';

    if (!name) {
      return Response.json({ error: 'Technical rider name is required.' }, { status: 400 });
    }

    if (name.length > 150) {
      return Response.json({ error: 'Technical rider name must be 150 characters or fewer.' }, { status: 400 });
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
      return Response.json({ error: 'You do not have permission to create technical riders for this band.' }, { status: 403 });
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

    // Technical riders require Pro or Crew plan
    if (effectivePlan === 'free' || !effectiveActive) {
      return Response.json(
        { error: 'Technical riders require a Pro or Crew plan. Upgrade to create technical riders for this band.' },
        { status: 403 }
      );
    }

    // Create the technical rider
    const riderId = crypto.randomUUID();
    const now = new Date().toISOString();

    await setFirestoreDocument(ctx.env, ['bands', bandId, 'technicalRiders', riderId], {
      name: name.trim(),
      icon: undefined,
      lines: [],
      preferredEquipment: [],
      inventoryEquipment: [],
      stageShape: undefined,
      stageSize: undefined,
      publicShareEnabled: false,
      bandName: band.name,
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
      ownerId: userId,
      drawingLayers: [],
      items: [],
    });

    return Response.json({ ok: true, riderId });
  } catch (error) {
    console.error('Error creating technical rider:', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to create technical rider.' },
      { status: 500 }
    );
  }
};
