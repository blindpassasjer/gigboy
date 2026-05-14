import { useEffect, useState } from 'react';
import {
  Check,
  Lock,
  Sparkles,
  Users,
} from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import toast from '../utils/anchoredToast';
import { useAuth } from '../context/AuthContext';
import { useOptionalBands } from '../context/BandsContext';
import { createCheckoutSession } from '../lib/billingApi';
import { usePlan } from '../hooks/usePlan';
import { PLAN_LABELS } from '../lib/planLimits';
import type { PlanTier } from '../types';

type BillingCycle = 'monthly' | 'annual';

interface PlanCard {
  tier: PlanTier;
  icon: typeof Sparkles;
  blurb: string;
  monthlyPrice: string;
  annualPrice: string | null;
  featureBullets: string[];
  ctaLabel: string;
  envKeyMonthly?: string;
  envKeyAnnual?: string;
}

const STRIPE_PRICE_IDS = {
  pro: {
    monthly: 'price_1TTcMZQ9ZHGjaIIRVQd0Kkqr',
    annual: 'price_1TTd6uQ9ZHGjaIIRvkQ1SHbe',
  },
  crew: {
    monthly: 'price_1TTcSVQ9ZHGjaIIRqMNvXTgI',
    annual: 'price_1TTd2aQ9ZHGjaIIRIbNu0NKp',
  },
  extraMember: {
    monthly: 'price_1TTdUEQ9ZHGjaIIRFEPOnaH0',
    annual: 'price_1TTdV0Q9ZHGjaIIRdt4HC9IQ',
  },
} as const;

const PLAN_CARDS: PlanCard[] = [
  {
    tier: 'free',
    icon: Lock,
    blurb: 'A lightweight account for trying Gigboy and keeping a small library.',
    monthlyPrice: 'Free',
    annualPrice: null,
    featureBullets: [
      'One free band workspace',
      '12 songs',
      '100 MB storage',
      'Song lists',
      'Setlists',
      'Stage plots',
      'Input list',
      'Shareable links',
      'Bluetooth pedal',
      'Recordings',
      'Metronome',
      'Multi-user notes',
      'Members: 1 owner',
      'Extra members: —',
    ],
    ctaLabel: 'Current free plan',
  },
  {
    tier: 'pro',
    icon: Sparkles,
    blurb: 'Everything a power user needs for rehearsals, setlists, recordings, and sharing.',
    monthlyPrice: '50 kr or 5 USD',
    annualPrice: '500 kr or 50 USD',
    featureBullets: [
      'One Pro band workspace',
      'Unlimited songs',
      '1 GB storage',
      'Song lists',
      'Setlists',
      'Stage plots',
      'Input list',
      'Shareable links',
      'Bluetooth pedal',
      'Recordings',
      'Metronome',
      'Multi-user notes',
      'Members: 1 owner',
      'Extra members: —',
    ],
    ctaLabel: 'Upgrade to Pro',
    envKeyMonthly: 'VITE_STRIPE_PRO_MONTHLY_PRICE_ID',
    envKeyAnnual: 'VITE_STRIPE_PRO_ANNUAL_PRICE_ID',
  },
  {
    tier: 'crew',
    icon: Users,
    blurb: 'A shared workspace for a band owner with member access and room to grow.',
    monthlyPrice: '150 kr or 15 USD',
    annualPrice: '1500 kr or 150 USD',
    featureBullets: [
      'Shared Crew band workspace',
      'Unlimited songs',
      '5 GB storage',
      'Song lists',
      'Setlists',
      'Stage plots',
      'Input list',
      'Shareable links',
      'Bluetooth pedal',
      'Recordings',
      'Metronome',
      'Multi-user notes',
      'Members: Up to 5',
      'Extra members are a Crew-only add-on: 20 kr / 2 USD monthly, 200 kr / 20 USD yearly',
    ],
    ctaLabel: 'Upgrade to Crew',
    envKeyMonthly: 'VITE_STRIPE_BAND_MONTHLY_PRICE_ID',
    envKeyAnnual: 'VITE_STRIPE_BAND_ANNUAL_PRICE_ID',
  },
];

function resolvePriceId(card: PlanCard, cycle: BillingCycle) {
  const key = cycle === 'annual' ? card.envKeyAnnual : card.envKeyMonthly;
  const fallbackPriceId = cycle === 'annual'
    ? STRIPE_PRICE_IDS[card.tier as 'pro' | 'crew']?.annual
    : STRIPE_PRICE_IDS[card.tier as 'pro' | 'crew']?.monthly;

  if (!key) return fallbackPriceId ?? null;

  const envPriceId = (import.meta.env[key] as string | undefined)?.trim();
  return envPriceId || fallbackPriceId || null;
}

const PLAN_ORDER: Record<PlanTier, number> = {
  free: 0,
  pro: 1,
  crew: 2,
};

function getCtaLabel(card: PlanCard, currentPlan: PlanTier, isCurrentPlan: boolean) {
  if (card.tier === 'free') {
    return isCurrentPlan ? card.ctaLabel : 'Use Free';
  }

  if (isCurrentPlan) {
    return `${PLAN_LABELS[card.tier]} active`;
  }

  const isUpgrade = PLAN_ORDER[card.tier] > PLAN_ORDER[currentPlan];
  const action = isUpgrade ? 'Upgrade' : 'Downgrade';
  return `${action} to ${PLAN_LABELS[card.tier]}`;
}

export default function PricingPage() {
  const { user } = useAuth();
  const bandsContext = useOptionalBands();
  const bands = bandsContext?.bands ?? [];
  const location = useLocation();
  const { plan } = usePlan();
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly');
  const [busyTier, setBusyTier] = useState<PlanTier | null>(null);
  const [extraMemberCount, setExtraMemberCount] = useState(0);

  const ownedBands = bands.filter((band) => band.ownerId === user?.id);
  const pricingState = (location.state as {
    bandId?: unknown;
    source?: unknown;
    requestedBandName?: unknown;
  } | null) ?? null;
  const redirectedFromSidebarNewBand = pricingState?.source === 'sidebar-new-band';
  const redirectedFromCreateNewBand = pricingState?.source === 'create-new-band';
  const requestedBandName = typeof pricingState?.requestedBandName === 'string'
    ? pricingState.requestedBandName.trim()
    : '';
  const stateBandId = (() => {
    const candidate = pricingState?.bandId;
    return typeof candidate === 'string' ? candidate : '';
  })();
  const initialBandId = ownedBands.some((band) => band.id === stateBandId)
    ? stateBandId
    : (ownedBands[0]?.id ?? '');
  const [selectedBandId, setSelectedBandId] = useState<string>(initialBandId);

  useEffect(() => {
    if (ownedBands.length === 0) {
      if (selectedBandId) setSelectedBandId('');
      return;
    }

    const hasSelectedBand = ownedBands.some((band) => band.id === selectedBandId);
    if (hasSelectedBand) return;

    const fallbackBandId = ownedBands.some((band) => band.id === stateBandId)
      ? stateBandId
      : ownedBands[0].id;
    setSelectedBandId(fallbackBandId);
  }, [ownedBands, selectedBandId, stateBandId]);

  const handleCheckout = async (card: PlanCard) => {
    if (card.tier === 'free') return;
    if (!user) {
      toast.error('Sign in first to upgrade your subscription.');
      return;
    }

    const priceId = resolvePriceId(card, billingCycle);
    if (!priceId) {
      toast.error('This plan is not configured yet. Add the Stripe price ID and try again.');
      return;
    }

    const isBandPlan = card.tier === 'crew' || card.tier === 'pro';
    if (isBandPlan && !redirectedFromCreateNewBand && !selectedBandId) {
      toast.error('Select which band you want to upgrade before continuing.');
      return;
    }
    const normalizedExtraMembers = isBandPlan ? Math.max(0, Math.min(500, Math.trunc(extraMemberCount))) : 0;
    const extraMemberPriceId = isBandPlan
      ? (
        billingCycle === 'annual'
          ? (import.meta.env.VITE_STRIPE_BAND_ANNUAL_EXTRA_MEMBER_PRICE_ID as string | undefined)
          : (import.meta.env.VITE_STRIPE_BAND_MONTHLY_EXTRA_MEMBER_PRICE_ID as string | undefined)
      )?.trim() || (billingCycle === 'annual'
        ? STRIPE_PRICE_IDS.extraMember.annual
        : STRIPE_PRICE_IDS.extraMember.monthly)
      : null;

    if (normalizedExtraMembers > 0 && !extraMemberPriceId) {
      toast.error('Extra members are not configured yet for this billing cycle.');
      return;
    }

    setBusyTier(card.tier);
    try {
      const result = await createCheckoutSession({
        userId: user.id,
        userEmail: user.email,
        priceId,
        successUrl: `${window.location.origin}/checkout-result?status=success`,
        cancelUrl: `${window.location.origin}/checkout-result?status=cancel`,
        ...(isBandPlan && !redirectedFromCreateNewBand ? { bandId: selectedBandId } : {}),
        ...(redirectedFromCreateNewBand && requestedBandName
          ? { newBandData: { name: requestedBandName } }
          : {}),
        ...(normalizedExtraMembers > 0 && extraMemberPriceId
          ? {
            extraMemberPriceId,
            extraMemberCount: normalizedExtraMembers,
          }
          : {}),
      });
      window.location.href = result.url;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start checkout.';
      toast.error(message);
    } finally {
      setBusyTier(null);
    }
  };

  return (
    <section className="pricing-page">
      <header className="pricing-hero">
        <div className="pricing-hero-bg" aria-hidden="true">
          <span className="pricing-note pricing-note--1">♩</span>
          <span className="pricing-note pricing-note--2">♪</span>
          <span className="pricing-note pricing-note--3">♫</span>
          <span className="pricing-note pricing-note--4">♬</span>
          <span className="pricing-note pricing-note--5">♩</span>
          <span className="pricing-note pricing-note--6">♪</span>
          <span className="pricing-note pricing-note--7">♫</span>
          <span className="pricing-note pricing-note--8">♬</span>
          <span className="pricing-grid" />
        </div>
        <span className="pricing-kicker">Pricing</span>
        <h1>Pay per band workspace</h1>
        <p>
          Every account gets one free band. Upgrade individual bands to Pro (all features for one member) or Crew (all features + up to 5 members).
        </p>
        {redirectedFromSidebarNewBand ? (
          <div className="pricing-source-banner" role="status">
            {requestedBandName
              ? `You already used your free band. Upgrade below to create "${requestedBandName}" as a paid workspace.`
              : 'You already used your free band. Upgrade below to create another paid workspace.'}
          </div>
        ) : null}
        {redirectedFromCreateNewBand ? (
          <div className="pricing-hero-notice">
            {requestedBandName
              ? `Subscribe below to create "${requestedBandName}" as a new band workspace.`
              : 'Subscribe below to create a new band workspace.'}
          </div>
        ) : null}
        <div className="pricing-hero-actions">
          <Link to="/profile" className="setlist-action-btn setlist-action-btn--secondary pricing-hero-back-link">
            Back to account
          </Link>
        </div>
        <div className="pricing-cycle-toggle" role="tablist" aria-label="Billing cycle">
          <button
            type="button"
            className={billingCycle === 'monthly' ? 'active' : ''}
            onClick={() => setBillingCycle('monthly')}
          >
            Monthly
          </button>
          <button
            type="button"
            className={billingCycle === 'annual' ? 'active' : ''}
            onClick={() => setBillingCycle('annual')}
          >
            Annual
          </button>
        </div>
      </header>

      <div className="pricing-card-grid">
        {PLAN_CARDS.map((card) => {
          const Icon = card.icon;
          const isCurrentPlan = plan === card.tier;
          const displayPrice = billingCycle === 'annual' && card.annualPrice ? card.annualPrice : card.monthlyPrice;
          const priceSuffix = card.tier === 'free' ? '' : billingCycle === 'annual' ? '/year' : '/month';
          const ctaLabel = getCtaLabel(card, plan, isCurrentPlan);

          return (
            <section
              key={card.tier}
              className={[
                'pricing-card',
                card.tier === 'crew' ? 'pricing-card--band' : '',
                isCurrentPlan ? 'pricing-card--active' : '',
              ].filter(Boolean).join(' ')}
            >
              <div className="pricing-card-header">
                <span className="pricing-card-icon"><Icon size={18} /></span>
                <div>
                  <h2>{PLAN_LABELS[card.tier]}</h2>
                  <p>{card.blurb}</p>
                </div>
              </div>
              <div className="pricing-card-price">
                <strong>{displayPrice}</strong>
                <span>{priceSuffix}</span>
              </div>
              <ul className="pricing-feature-list">
                {card.featureBullets.map((feature) => (
                  <li key={feature}>
                    <Check size={16} />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              {(card.tier === 'crew' || card.tier === 'pro') && !redirectedFromCreateNewBand ? (
                <label className="share-menu-field" style={{ marginBottom: '0.65rem' }}>
                  <span>Band workspace</span>
                  <select
                    value={selectedBandId}
                    onChange={(event) => setSelectedBandId(event.target.value)}
                    disabled={busyTier === card.tier || ownedBands.length === 0}
                  >
                    {ownedBands.length === 0 ? <option value="">Create a band first</option> : null}
                    {ownedBands.map((band) => (
                      <option key={band.id} value={band.id}>{band.name}</option>
                    ))}
                  </select>
                </label>
              ) : null}
              {card.tier === 'crew' ? (
                <label className="share-menu-field" style={{ marginBottom: '0.85rem' }}>
                    <span>Extra members ({billingCycle === 'annual' ? '200 kr / 20 USD each per year' : '20 kr / 2 USD each per month'})</span>
                    <input
                      type="number"
                      min={0}
                      max={500}
                      value={extraMemberCount}
                      onChange={(event) => setExtraMemberCount(Number(event.target.value) || 0)}
                      disabled={busyTier === card.tier || ownedBands.length === 0}
                    />
                  </label>
              ) : null}
              {card.tier === 'free' ? (
                <Link to="/profile" className="setlist-action-btn setlist-action-btn--secondary pricing-card-btn">
                  {ctaLabel}
                </Link>
              ) : (
                <button
                  type="button"
                  className="setlist-action-btn pricing-card-btn"
                  disabled={busyTier === card.tier || isCurrentPlan || ((card.tier === 'crew' || card.tier === 'pro') && !redirectedFromCreateNewBand && ownedBands.length === 0)}
                  onClick={() => void handleCheckout(card)}
                >
                  {busyTier === card.tier
                    ? 'Redirecting…'
                    : (card.tier === 'crew' || card.tier === 'pro') && !redirectedFromCreateNewBand && ownedBands.length === 0
                      ? 'Create a band first'
                      : ctaLabel}
                </button>
              )}
            </section>
          );
        })}
      </div>

    </section>
  );
}