/// <reference types="@cloudflare/workers-types" />
import { getFirestoreDocument, setFirestoreDocument, countFirestoreDocumentsByField } from '../../_helpers/firebase-admin';

interface Data extends Record<string, unknown> {
  userId?: string;
}

export const onRequestPost: PagesFunction<Record<string, string | undefined>, never, Data> = async (ctx) => {
  try {
    const userId = ctx.data.userId;
    if (!userId) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userEmail = ctx.request.headers.get('x-gigboy-user-email')?.trim() ?? '';
    const body = await ctx.request.json<{ name?: string; description?: string; icon?: string }>();
    const name = body.name?.trim() ?? '';
    const description = body.description?.trim() || undefined;
    const icon = body.icon?.trim() || undefined;

    if (!name) {
      return Response.json({ error: 'Band name is required.' }, { status: 400 });
    }

    if (name.length > 80) {
      return Response.json({ error: 'Band name must be 80 characters or fewer.' }, { status: 400 });
    }

    if (description && description.length > 240) {
      return Response.json({ error: 'Band description must be 240 characters or fewer.' }, { status: 400 });
    }

    // Check free-tier band limit: max 1 free band per user
    const profile = await getFirestoreDocument(ctx.env, ['users', userId]);
    const userPlan = profile?.plan === 'pro' || profile?.plan === 'crew' ? profile.plan : 'free';
    const subscriptionStatus = profile?.subscriptionStatus;
    const planOverride = profile?.planOverride === true;
    
    // If user is on free tier (not pro/crew with active subscription), check they don't already have a free band
    const isActivePlan = userPlan === 'free' || planOverride || subscriptionStatus === 'active' || subscriptionStatus === 'trialing';
    if (userPlan === 'free' && isActivePlan) {
      // Count existing bands owned by this user
      const ownedBandCount = await countFirestoreDocumentsByField(ctx.env, 'bands', 'ownerId', userId);
      
      if (ownedBandCount > 0) {
        return Response.json(
          { error: 'Free tier accounts can only create one band workspace. Upgrade to Pro or Crew to create more.' },
          { status: 403 }
        );
      }
    }

    const bandId = crypto.randomUUID();
    const now = new Date().toISOString();
    const username = typeof profile?.username === 'string' ? profile.username : '';
    const fullName = typeof profile?.fullName === 'string' ? profile.fullName : '';
    const avatar = typeof profile?.avatar === 'string' ? profile.avatar : '';

    await setFirestoreDocument(ctx.env, ['bands', bandId], {
      name,
      description,
      icon,
      ownerId: userId,
      memberIds: [userId],
      memberRoles: {
        [userId]: 'editor',
      },
      memberEmails: userEmail ? { [userId]: userEmail } : {},
      memberUsernames: username ? { [userId]: username } : {},
      memberFullNames: fullName ? { [userId]: fullName } : {},
      memberAvatars: avatar ? { [userId]: avatar } : {},
      createdAt: now,
      updatedAt: now,
    });

    return Response.json({ ok: true, bandId });
  } catch (error) {
    console.error('Failed to create band.', error);
    return Response.json(
      {
        error: error instanceof Error ? error.message : 'Failed to create band.',
      },
      { status: 500 }
    );
  }
};

export const onRequest: PagesFunction<Record<string, string | undefined>, never, Data> = async (ctx) => {
  if (ctx.request.method !== 'POST') {
    return new Response('Method Not Allowed', {
      status: 405,
      headers: {
        Allow: 'POST',
      },
    });
  }

  return onRequestPost(ctx);
};