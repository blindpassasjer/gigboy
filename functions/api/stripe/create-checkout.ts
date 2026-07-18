/// <reference types="@cloudflare/workers-types" />
import Stripe from 'stripe';
import { getFirestoreDocument, setFirestoreDocument } from '../../_helpers/firebase-admin';
import {
  getStripeClient,
  planTierFromPriceId,
} from '../../_helpers/stripe';

interface Env {
  FIREBASE_PROJECT_ID?: string;
  FIREBASE_PRIVATE_KEY?: string;
  FIREBASE_CLIENT_EMAIL?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_PRO_MONTHLY_PRICE_ID?: string;
  STRIPE_PRO_ANNUAL_PRICE_ID?: string;
  STRIPE_CREW_MONTHLY_PRICE_ID?: string;
  STRIPE_CREW_ANNUAL_PRICE_ID?: string;
  STRIPE_CREW_MONTHLY_EXTRA_MEMBER_PRICE_ID?: string;
  STRIPE_CREW_ANNUAL_EXTRA_MEMBER_PRICE_ID?: string;
}

interface Data extends Record<string, unknown> {
  userId?: string;
  userEmail?: string;
}

function generateBandId() {
  return `band_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function isAllowedReturnUrl(url: string, requestOrigin: string): boolean {
  try {
    return new URL(url).origin === requestOrigin;
  } catch {
    return false;
  }
}

export const onRequestPost: PagesFunction<Env, never, Data> = async (ctx) => {
  const userId = ctx.data.userId;
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const secretKey = ctx.env.STRIPE_SECRET_KEY;
  if (!secretKey) return Response.json({ error: 'Billing is not configured.' }, { status: 503 });

  const body = await ctx.request.json<{
    priceId?: string;
    successUrl?: string;
    cancelUrl?: string;
    extraMemberPriceId?: string;
    extraMemberCount?: number;
    bandId?: string;
    newBandData?: { name?: string };
  }>().catch(() => null);

  if (!body?.priceId || !body?.successUrl || !body?.cancelUrl) {
    return Response.json({ error: 'Missing required fields.' }, { status: 400 });
  }

  const requestOrigin = new URL(ctx.request.url).origin;
  if (!isAllowedReturnUrl(body.successUrl, requestOrigin) || !isAllowedReturnUrl(body.cancelUrl, requestOrigin)) {
    return Response.json({ error: 'Invalid redirect URL.' }, { status: 400 });
  }

  if (!body.priceId.startsWith('price_')) {
    return Response.json(
      { error: 'Invalid Stripe price ID. Expected a value starting with "price_".' },
      { status: 400 }
    );
  }

  const requestedPlan = planTierFromPriceId(body.priceId, ctx.env as Record<string, string | undefined>);
  const requestedBandId = typeof body.bandId === 'string' ? body.bandId.trim() : '';
  const hasNewBandData = typeof body.newBandData === 'object' && body.newBandData !== null;
  const newBandName = hasNewBandData && typeof body.newBandData.name === 'string'
    ? body.newBandData.name.trim()
    : '';
  const isNewBandRequest = !requestedBandId && newBandName !== '';
  const bandIdToUse = requestedBandId || (isNewBandRequest ? generateBandId() : '');

  if (isNewBandRequest && (requestedPlan !== 'crew' && requestedPlan !== 'pro')) {
    return Response.json({ error: 'New bands must be on Pro or Crew plans.' }, { status: 400 });
  }

  if ((requestedPlan === 'crew' || requestedPlan === 'pro') && !requestedBandId && !isNewBandRequest) {
    return Response.json({ error: 'bandId is required for Pro and Crew subscriptions.' }, { status: 400 });
  }

  let existingBand: Record<string, unknown> | null = null;
  if ((requestedPlan === 'crew' || requestedPlan === 'pro') && !isNewBandRequest) {
    existingBand = await getFirestoreDocument(ctx.env, ['bands', bandIdToUse]);
    if (!existingBand) {
      return Response.json({ error: 'Band not found.' }, { status: 404 });
    }
    if (existingBand.ownerId !== userId) {
      return Response.json({ error: 'Only the band owner can manage this subscription.' }, { status: 403 });
    }
  }

  const requestedExtraMemberCount =
    typeof body.extraMemberCount === 'number' && Number.isFinite(body.extraMemberCount)
      ? Math.trunc(body.extraMemberCount)
      : 0;

  if (requestedExtraMemberCount < 0 || requestedExtraMemberCount > 500) {
    return Response.json({ error: 'extraMemberCount must be between 0 and 500.' }, { status: 400 });
  }

  if (requestedExtraMemberCount > 0 && !body.extraMemberPriceId) {
    return Response.json({ error: 'extraMemberPriceId is required when extraMemberCount is greater than 0.' }, { status: 400 });
  }

  if (body.extraMemberPriceId && !body.extraMemberPriceId.startsWith('price_')) {
    return Response.json(
      { error: 'Invalid extra member price ID. Expected a value starting with "price_".' },
      { status: 400 }
    );
  }

  const userEmail = typeof ctx.data.userEmail === 'string' && ctx.data.userEmail ? ctx.data.userEmail : undefined;

  try {
    const stripe = getStripeClient(secretKey);

    // Retrieve or create Stripe Customer, storing the ID in Firestore.
    const profile = await getFirestoreDocument(ctx.env as Record<string, string | undefined>, ['users', userId]);
    const profilePlan = profile?.plan === 'crew' || profile?.plan === 'pro' ? profile.plan : 'free';

    const allowedExtraMemberPrices = new Set([
      ctx.env.STRIPE_CREW_MONTHLY_EXTRA_MEMBER_PRICE_ID,
      ctx.env.STRIPE_CREW_ANNUAL_EXTRA_MEMBER_PRICE_ID,
    ].filter((entry): entry is string => Boolean(entry)));

    const hasExtraMemberItem = requestedExtraMemberCount > 0;
    if (hasExtraMemberItem && requestedPlan !== 'crew' && profilePlan !== 'crew') {
      return Response.json({ error: 'Extra members are only available with the Crew plan.' }, { status: 400 });
    }

    if (body.extraMemberPriceId && !allowedExtraMemberPrices.has(body.extraMemberPriceId)) {
      return Response.json({ error: 'Extra member add-on is not configured for this environment.' }, { status: 400 });
    }

    // If this band already has a live Stripe subscription, change its plan in place instead
    // of starting a second, independent subscription (which would race with the old one's
    // renewal webhooks and randomly clobber the band's billing snapshot in Firestore).
    const existingSubscriptionId = typeof existingBand?.stripeSubscriptionId === 'string'
      ? existingBand.stripeSubscriptionId
      : null;
    const existingBandItemId = typeof existingBand?.stripeBandItemId === 'string'
      ? existingBand.stripeBandItemId
      : null;
    const existingStatus = typeof existingBand?.billingSubscriptionStatus === 'string'
      ? existingBand.billingSubscriptionStatus
      : null;
    const hasLiveSubscription = Boolean(
      existingSubscriptionId
      && existingBandItemId
      && (existingStatus === 'active' || existingStatus === 'trialing' || existingStatus === 'past_due')
    );

    if (hasLiveSubscription && existingSubscriptionId && existingBandItemId) {
      const items: Stripe.SubscriptionUpdateParams.Item[] = [
        { id: existingBandItemId, price: body.priceId },
      ];

      const existingExtraItemId = typeof existingBand?.stripeExtraMembersItemId === 'string'
        ? existingBand.stripeExtraMembersItemId
        : null;
      const wantsExtraItem = requestedPlan === 'crew' && hasExtraMemberItem && Boolean(body.extraMemberPriceId);

      if (wantsExtraItem && body.extraMemberPriceId) {
        items.push(
          existingExtraItemId
            ? { id: existingExtraItemId, price: body.extraMemberPriceId, quantity: requestedExtraMemberCount }
            : { price: body.extraMemberPriceId, quantity: requestedExtraMemberCount, metadata: { bandId: bandIdToUse, itemType: 'band_extra_members' } }
        );
      } else if (existingExtraItemId) {
        items.push({ id: existingExtraItemId, deleted: true });
      }

      await stripe.subscriptions.update(existingSubscriptionId, {
        items,
        proration_behavior: 'create_prorations',
      });

      return Response.json({ updated: true });
    }

    let customerId = typeof profile?.stripeCustomerId === 'string' ? profile.stripeCustomerId : null;

    if (!customerId) {
      const customer = await stripe.customers.create({
        metadata: { firebaseUid: userId },
        ...(userEmail ? { email: userEmail } : {}),
      });
      customerId = customer.id;
      await setFirestoreDocument(ctx.env as Record<string, string | undefined>, ['users', userId], {
        stripeCustomerId: customerId,
      });
    }

    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
      { price: body.priceId, quantity: 1 },
    ];

    if (hasExtraMemberItem && body.extraMemberPriceId) {
      lineItems.push({
        price: body.extraMemberPriceId,
        quantity: requestedExtraMemberCount,
      });
    }

    const sessionMetadata: Record<string, string> = {
      firebaseUid: userId,
    };
    const subscriptionMetadata: Record<string, string> = {
      firebaseUid: userId,
    };

    if (requestedPlan === 'crew' || requestedPlan === 'pro') {
      subscriptionMetadata.gigboyMode = 'band_aggregate';
      if (bandIdToUse) sessionMetadata.bandId = bandIdToUse;
      if (isNewBandRequest) sessionMetadata.pendingBandName = newBandName;
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: lineItems,
      success_url: body.successUrl,
      cancel_url: body.cancelUrl,
      allow_promotion_codes: true,
      metadata: sessionMetadata,
      subscription_data: {
        metadata: subscriptionMetadata,
      },
    });

    if (!session.url) {
      return Response.json({ error: 'Failed to create checkout session.' }, { status: 500 });
    }

    return Response.json({ url: session.url });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown checkout error';
    console.error('create-checkout failed:', message);

    if (message.includes('No such price')) {
      return Response.json({ error: 'Stripe price ID is invalid for this environment.' }, { status: 400 });
    }

    if (message.includes('Firebase credentials not configured')) {
      return Response.json({ error: 'Billing backend is missing Firebase credentials.' }, { status: 503 });
    }

    return Response.json({ error: 'Failed to create checkout session.' }, { status: 500 });
  }
};
