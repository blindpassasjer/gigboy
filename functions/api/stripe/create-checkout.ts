/// <reference types="@cloudflare/workers-types" />
import Stripe from 'stripe';
import { getFirestoreDocument, setFirestoreDocument } from '../../_helpers/firebase-admin';
import { getStripeClient, planTierFromPriceId } from '../../_helpers/stripe';

interface Env {
  FIREBASE_PROJECT_ID?: string;
  FIREBASE_PRIVATE_KEY?: string;
  FIREBASE_CLIENT_EMAIL?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_PRO_MONTHLY_PRICE_ID?: string;
  STRIPE_PRO_ANNUAL_PRICE_ID?: string;
  STRIPE_BAND_MONTHLY_PRICE_ID?: string;
  STRIPE_BAND_ANNUAL_PRICE_ID?: string;
  STRIPE_BAND_MONTHLY_EXTRA_MEMBER_PRICE_ID?: string;
  STRIPE_BAND_ANNUAL_EXTRA_MEMBER_PRICE_ID?: string;
}

interface Data extends Record<string, unknown> {
  userId?: string;
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
  }>().catch(() => null);

  if (!body?.priceId || !body?.successUrl || !body?.cancelUrl) {
    return Response.json({ error: 'Missing required fields.' }, { status: 400 });
  }

  if (!body.priceId.startsWith('price_')) {
    return Response.json(
      { error: 'Invalid Stripe price ID. Expected a value starting with "price_".' },
      { status: 400 }
    );
  }

  const requestedPlan = planTierFromPriceId(body.priceId, ctx.env as Record<string, string | undefined>);
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

  const userEmail = ctx.request.headers.get('x-gigboy-user-email')?.trim() ?? undefined;

  try {
    const stripe = getStripeClient(secretKey);

    // Retrieve or create Stripe Customer, storing the ID in Firestore.
    const profile = await getFirestoreDocument(ctx.env as Record<string, string | undefined>, ['users', userId]);
    const profilePlan = profile?.plan === 'band' || profile?.plan === 'pro' ? profile.plan : 'free';

    const allowedExtraMemberPrices = new Set([
      ctx.env.STRIPE_BAND_MONTHLY_EXTRA_MEMBER_PRICE_ID,
      ctx.env.STRIPE_BAND_ANNUAL_EXTRA_MEMBER_PRICE_ID,
    ].filter((entry): entry is string => Boolean(entry)));

    const hasExtraMemberItem = requestedExtraMemberCount > 0;
    if (hasExtraMemberItem && requestedPlan !== 'band' && profilePlan !== 'band') {
      return Response.json({ error: 'Extra members are only available with the Band plan.' }, { status: 400 });
    }

    if (body.extraMemberPriceId && !allowedExtraMemberPrices.has(body.extraMemberPriceId)) {
      return Response.json({ error: 'Extra member add-on is not configured for this environment.' }, { status: 400 });
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

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: lineItems,
      success_url: body.successUrl,
      cancel_url: body.cancelUrl,
      allow_promotion_codes: true,
      subscription_data: {
        metadata: { firebaseUid: userId },
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
