/// <reference types="@cloudflare/workers-types" />
import Stripe from 'stripe';
import { getFirestoreDocument, setFirestoreDocument } from '../../_helpers/firebase-admin';
import {
  getStripeClient,
  mapStripeStatus,
  planAndExtraMembersFromSubscription,
  planTierFromPriceId,
  updateUserPlan,
} from '../../_helpers/stripe';

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

interface BandBillingSnapshot {
  subscriptionStatus: 'active' | 'trialing' | 'past_due' | 'canceled' | 'unpaid' | 'incomplete' | null;
  currentPeriodEnd: number | null;
  extraMembers: number;
  memberLimit: number;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripeBandItemId: string | null;
  stripeExtraMembersItemId: string | null;
}

function isBandBasePriceId(priceId: string, env: Env): boolean {
  return priceId === env.STRIPE_BAND_MONTHLY_PRICE_ID || priceId === env.STRIPE_BAND_ANNUAL_PRICE_ID;
}

function toBandBillingSnapshot(
  subscription: Stripe.Subscription,
  env: Env,
  bandId: string
): BandBillingSnapshot {
  const status = mapStripeStatus(subscription.status);
  const baseItem = subscription.items.data.find((item) => {
    const priceId = item.price?.id ?? '';
    return isBandBasePriceId(priceId, env) && item.metadata?.bandId === bandId;
  }) ?? null;

  const extraItem = subscription.items.data.find((item) => {
    const priceId = item.price?.id ?? '';
    const isExtra = priceId === env.STRIPE_BAND_MONTHLY_EXTRA_MEMBER_PRICE_ID
      || priceId === env.STRIPE_BAND_ANNUAL_EXTRA_MEMBER_PRICE_ID;
    return isExtra && item.metadata?.bandId === bandId;
  }) ?? null;

  const extraMembers = Math.max(0, Math.min(500, Math.trunc(extraItem?.quantity ?? 0)));
  const memberLimit = 5 + extraMembers;

  return {
    subscriptionStatus: status,
    currentPeriodEnd: baseItem?.current_period_end ?? subscription.items.data[0]?.current_period_end ?? null,
    extraMembers,
    memberLimit,
    stripeCustomerId: typeof subscription.customer === 'string'
      ? subscription.customer
      : (subscription.customer as Stripe.Customer)?.id ?? null,
    stripeSubscriptionId: subscription.id,
    stripeBandItemId: baseItem?.id ?? null,
    stripeExtraMembersItemId: extraItem?.id ?? null,
  };
}

async function writeBandBillingSnapshot(
  env: Record<string, string | undefined>,
  bandId: string,
  snapshot: BandBillingSnapshot
) {
  const active = snapshot.subscriptionStatus === 'active' || snapshot.subscriptionStatus === 'trialing';
  await setFirestoreDocument(env, ['bands', bandId], {
    billingPlan: active ? 'band' : 'free',
    billingSubscriptionStatus: snapshot.subscriptionStatus,
    billingCurrentPeriodEnd: snapshot.currentPeriodEnd,
    billingExtraMembers: snapshot.extraMembers,
    billingMemberLimit: active ? snapshot.memberLimit : 1,
    stripeCustomerId: snapshot.stripeCustomerId,
    stripeSubscriptionId: snapshot.stripeSubscriptionId,
    stripeBandItemId: snapshot.stripeBandItemId,
    stripeExtraMembersItemId: snapshot.stripeExtraMembersItemId,
  });
}

async function findAggregateBandSubscription(
  stripe: Stripe,
  customerId: string,
  userId: string
): Promise<Stripe.Subscription | null> {
  const list = await stripe.subscriptions.list({
    customer: customerId,
    status: 'all',
    limit: 25,
  });

  const match = list.data.find((sub) => {
    if (sub.metadata?.gigboyMode !== 'band_aggregate') return false;
    return sub.metadata?.firebaseUid === userId;
  });

  return match ?? null;
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
  const requestedBandId = typeof body.bandId === 'string' ? body.bandId.trim() : '';
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

    if (requestedPlan === 'band' && !requestedBandId) {
      return Response.json({ error: 'bandId is required for Band subscriptions.' }, { status: 400 });
    }

    if (requestedPlan === 'band') {
      const band = await getFirestoreDocument(ctx.env, ['bands', requestedBandId]);
      if (!band) {
        return Response.json({ error: 'Band not found.' }, { status: 404 });
      }
      if (band.ownerId !== userId) {
        return Response.json({ error: 'Only the band owner can manage this subscription.' }, { status: 403 });
      }
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

    if (requestedPlan === 'band') {
      const aggregateSubscription = await findAggregateBandSubscription(stripe, customerId, userId);

      if (aggregateSubscription) {
        const existingBaseItem = aggregateSubscription.items.data.find((item) => {
          const priceId = item.price?.id ?? '';
          return isBandBasePriceId(priceId, ctx.env) && item.metadata?.bandId === requestedBandId;
        }) ?? null;

        const existingExtraItem = aggregateSubscription.items.data.find((item) => {
          const priceId = item.price?.id ?? '';
          const isExtra = priceId === ctx.env.STRIPE_BAND_MONTHLY_EXTRA_MEMBER_PRICE_ID
            || priceId === ctx.env.STRIPE_BAND_ANNUAL_EXTRA_MEMBER_PRICE_ID;
          return isExtra && item.metadata?.bandId === requestedBandId;
        }) ?? null;

        const subscriptionItems: Stripe.SubscriptionUpdateParams.Item[] = [];

        if (existingBaseItem) {
          subscriptionItems.push({
            id: existingBaseItem.id,
            price: body.priceId,
            quantity: 1,
            metadata: {
              bandId: requestedBandId,
              itemType: 'band_base',
            },
          });
        } else {
          subscriptionItems.push({
            price: body.priceId,
            quantity: 1,
            metadata: {
              bandId: requestedBandId,
              itemType: 'band_base',
            },
          });
        }

        if (requestedExtraMemberCount > 0 && body.extraMemberPriceId) {
          if (existingExtraItem) {
            subscriptionItems.push({
              id: existingExtraItem.id,
              price: body.extraMemberPriceId,
              quantity: requestedExtraMemberCount,
              metadata: {
                bandId: requestedBandId,
                itemType: 'band_extra_members',
              },
            });
          } else {
            subscriptionItems.push({
              price: body.extraMemberPriceId,
              quantity: requestedExtraMemberCount,
              metadata: {
                bandId: requestedBandId,
                itemType: 'band_extra_members',
              },
            });
          }
        } else if (existingExtraItem) {
          subscriptionItems.push({
            id: existingExtraItem.id,
            deleted: true,
          });
        }

        const updatedSubscription = await stripe.subscriptions.update(aggregateSubscription.id, {
          items: subscriptionItems,
          metadata: {
            ...aggregateSubscription.metadata,
            firebaseUid: userId,
            gigboyMode: 'band_aggregate',
          },
          proration_behavior: 'create_prorations',
        });

        await writeBandBillingSnapshot(
          ctx.env as Record<string, string | undefined>,
          requestedBandId,
          toBandBillingSnapshot(updatedSubscription, ctx.env, requestedBandId)
        );

        const aggregatePlan = planAndExtraMembersFromSubscription(
          updatedSubscription,
          ctx.env as Record<string, string | undefined>
        );

        await updateUserPlan(ctx.env as Record<string, string | undefined>, userId, {
          plan: aggregatePlan.plan,
          subscriptionStatus: mapStripeStatus(updatedSubscription.status),
          currentPeriodEnd: updatedSubscription.items.data[0]?.current_period_end ?? null,
          stripeCustomerId: customerId,
          bandExtraMembers: aggregatePlan.bandExtraMembers,
        });

        return Response.json({ url: body.successUrl });
      }
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
      metadata: {
        firebaseUid: userId,
        ...(requestedPlan === 'band' ? { bandId: requestedBandId } : {}),
      },
      subscription_data: {
        metadata: {
          firebaseUid: userId,
          ...(requestedPlan === 'band' ? { gigboyMode: 'band_aggregate' } : {}),
        },
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
