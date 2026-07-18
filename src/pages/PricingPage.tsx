import { useEffect, useState } from 'react';
import {
  Disc3,
  Headphones,
  Link2,
  ListMusic,
  Lock,
  Map,
  Mic2,
  Music,
  NotebookPen,
  Plus,
  Share2,
  Sparkles,
  Users,
} from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import BrandMark from '../components/BrandMark';
import toast from '../utils/anchoredToast';
import { useAuth } from '../context/AuthContext';
import { useOptionalBands } from '../context/BandsContext';
import { createCheckoutSession } from '../lib/billingApi';
import { useBandPlan } from '../hooks/usePlan';
import { PLAN_LABELS } from '../lib/planLimits';
import type { PlanTier } from '../types';

type BillingCycle = 'monthly' | 'annual';

interface FeatureBullet {
  icon: typeof Sparkles;
  label: string;
}

interface PlanCard {
  tier: PlanTier;
  icon: typeof Sparkles;
  blurb: string;
  monthlyPrice: string;
  annualPrice: string | null;
  featureBullets: FeatureBullet[];
  ctaLabel: string;
  envKeyMonthly?: string;
  envKeyAnnual?: string;
}

const PLAN_CARDS: PlanCard[] = [
  {
    tier: 'free',
    icon: Lock,
    blurb: 'A lightweight account for trying Gigboy and keeping a small library.',
    monthlyPrice: 'Free',
    annualPrice: null,
    featureBullets: [
      { icon: Users, label: '1 band workspace' },
      { icon: Music, label: 'Up to 12 songs' },
      { icon: Disc3, label: '100 MB storage' },
      { icon: ListMusic, label: 'Song lists' },
      { icon: Map, label: 'Stage plots' },
      { icon: NotebookPen, label: '1 setlist' },
      { icon: Users, label: '1 member (owner only)' },
    ],
    ctaLabel: 'Current free plan',
  },
  {
    tier: 'pro',
    icon: Sparkles,
    blurb: 'Everything a power user needs for rehearsals, setlists, recordings, and sharing.',
    monthlyPrice: '2.99 USD',
    annualPrice: '29.99 USD',
    featureBullets: [
      { icon: Users, label: '1 band workspace' },
      { icon: Music, label: 'Unlimited songs' },
      { icon: Disc3, label: '1 GB storage' },
      { icon: ListMusic, label: 'Song lists & stage plots' },
      { icon: NotebookPen, label: 'Setlists & concert mode' },
      { icon: Link2, label: 'Technical riders' },
      { icon: Share2, label: 'Press kits' },
      { icon: Share2, label: 'Shareable public links' },
      { icon: Headphones, label: 'Audio recordings' },
      { icon: Mic2, label: 'Metronome' },
      { icon: Sparkles, label: 'Multi-user notes' },
      { icon: Link2, label: 'Song attachments' },
      { icon: Users, label: '1 member (owner only)' },
    ],
    ctaLabel: 'Upgrade to Pro',
    envKeyMonthly: 'VITE_STRIPE_PRO_MONTHLY_PRICE_ID',
    envKeyAnnual: 'VITE_STRIPE_PRO_ANNUAL_PRICE_ID',
  },
  {
    tier: 'crew',
    icon: Users,
    blurb: 'A shared workspace for a band owner with member access and room to grow.',
    monthlyPrice: '9.99 USD',
    annualPrice: '99.99 USD',
    featureBullets: [
      { icon: Users, label: '1 shared band workspace' },
      { icon: Music, label: 'Unlimited songs' },
      { icon: Disc3, label: '5 GB storage' },
      { icon: ListMusic, label: 'Song lists & stage plots' },
      { icon: NotebookPen, label: 'Setlists & concert mode' },
      { icon: Link2, label: 'Technical riders' },
      { icon: Share2, label: 'Press kits' },
      { icon: Share2, label: 'Shareable public links' },
      { icon: Headphones, label: 'Audio recordings' },
      { icon: Mic2, label: 'Metronome' },
      { icon: Sparkles, label: 'Multi-user notes' },
      { icon: Link2, label: 'Song attachments' },
      { icon: Users, label: 'Up to 5 members' },
      { icon: Users, label: 'Extra members: 1.99 USD/month or 19.99 USD/year each' },
    ],
    ctaLabel: 'Upgrade to Crew',
    envKeyMonthly: 'VITE_STRIPE_CREW_MONTHLY_PRICE_ID',
    envKeyAnnual: 'VITE_STRIPE_CREW_ANNUAL_PRICE_ID',
  },
];

function resolvePriceId(card: PlanCard, cycle: BillingCycle) {
  const key = cycle === 'annual' ? card.envKeyAnnual : card.envKeyMonthly;
  if (!key) return null;

  const envPriceId = (import.meta.env[key] as string | undefined)?.trim();
  return envPriceId || null;
}

const PLAN_ORDER: Record<PlanTier, number> = {
  free: 0,
  pro: 1,
  crew: 2,
};

function getCtaLabel(
  card: PlanCard,
  currentPlan: PlanTier,
  isCurrentPlan: boolean,
  creatingNewBand: boolean,
) {
  if (card.tier === 'free') {
    if (isCurrentPlan) return card.ctaLabel;
    return creatingNewBand ? 'Create a free band' : 'Downgrade to Free';
  }

  if (isCurrentPlan) {
    return `${PLAN_LABELS[card.tier]} active`;
  }

  if (creatingNewBand) {
    return `Create a new ${PLAN_LABELS[card.tier]} band`;
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
  const navigate = useNavigate();
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly');
  const [busyTier, setBusyTier] = useState<PlanTier | null>(null);
  const [extraMemberCount, setExtraMemberCount] = useState(0);
  const [newBandName, setNewBandName] = useState<string>('');

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
  const initialBandId = ownedBands.length === 0
    ? 'new'
    : ownedBands.some((band) => band.id === stateBandId)
      ? stateBandId
      : (ownedBands[0]?.id ?? 'new');
  const [selectedBandId, setSelectedBandId] = useState<string>(initialBandId);

  const selectedBand = selectedBandId === 'new'
    ? null
    : ownedBands.find((band) => band.id === selectedBandId) ?? null;
  const selectedBandPlanState = useBandPlan(selectedBand);

  useEffect(() => {
    if (ownedBands.length === 0) {
      if (selectedBandId !== 'new') setSelectedBandId('new');
      return;
    }

    const hasSelectedBand = ownedBands.some((band) => band.id === selectedBandId);
    if (hasSelectedBand || selectedBandId === 'new') return;

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
    if (isBandPlan && !redirectedFromCreateNewBand && selectedBandId !== 'new' && !selectedBandId) {
      toast.error('Select which band you want to upgrade before continuing.');
      return;
    }
    if (isBandPlan && !redirectedFromCreateNewBand && selectedBandId === 'new' && !newBandName.trim()) {
      toast.error('Enter a name for the new band.');
      return;
    }
    const normalizedExtraMembers = isBandPlan ? Math.max(0, Math.min(500, Math.trunc(extraMemberCount))) : 0;
    const extraMemberPriceId = isBandPlan
      ? (
        billingCycle === 'annual'
          ? (import.meta.env.VITE_STRIPE_CREW_ANNUAL_EXTRA_MEMBER_PRICE_ID as string | undefined)
          : (import.meta.env.VITE_STRIPE_CREW_MONTHLY_EXTRA_MEMBER_PRICE_ID as string | undefined)
      )?.trim() || null
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
        ...(isBandPlan && !redirectedFromCreateNewBand && selectedBandId !== 'new' ? { bandId: selectedBandId } : {}),
        ...(isBandPlan && !redirectedFromCreateNewBand && selectedBandId === 'new'
          ? { newBandData: { name: newBandName.trim() } }
          : {}),
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
      if ('url' in result) {
        window.location.href = result.url;
      } else {
        toast.success('Plan updated!');
        navigate('/checkout-result?status=success');
      }
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
        <Link to="/profile" className="pricing-hero-nav-link">
          &larr; Back to account
        </Link>
        <div className="pricing-hero-intro">
          <span className="pricing-kicker">Pricing</span>
          <BrandMark size={44} />
          <h1>Pay per band workspace</h1>
          <p>
            Every account gets one free band. Upgrade individual bands to Pro (all features for one member) or Crew (all features + up to 5 members).
          </p>
        </div>
        <div className="pricing-hero-divider" aria-hidden="true" />
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
        <div className="pricing-hero-controls">
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
          {(ownedBands.length > 0 || selectedBandId === 'new') ? (
            <div className="pricing-hero-band-select">
              <span className="pricing-band-chips-label">Band workspace</span>
              <div className="pricing-band-chips" role="tablist" aria-label="Band workspace">
                {ownedBands.map((band) => (
                  <button
                    key={band.id}
                    type="button"
                    role="tab"
                    aria-selected={selectedBandId === band.id}
                    className={`pricing-band-chip${selectedBandId === band.id ? ' active' : ''}`}
                    onClick={() => setSelectedBandId(band.id)}
                  >
                    {band.name}
                  </button>
                ))}
                <button
                  type="button"
                  role="tab"
                  aria-selected={selectedBandId === 'new'}
                  className={`pricing-band-chip pricing-band-chip--new${selectedBandId === 'new' ? ' active' : ''}`}
                  onClick={() => setSelectedBandId('new')}
                >
                  <Plus size={14} />
                  New band
                </button>
              </div>
              {selectedBandId === 'new' ? (
                <label className="share-menu-field" style={{ marginTop: '.65rem', marginBottom: '0.65rem' }}>
                  <span>Band name</span>
                  <input
                    type="text"
                    value={newBandName}
                    onChange={(event) => setNewBandName(event.target.value)}
                    placeholder="Enter band name"
                  />
                </label>
              ) : null}
            </div>
          ) : null}
        </div>
      </header>

      {(ownedBands.length > 0 || selectedBandId === 'new') ? (
        <p className="pricing-context-label">
          {selectedBandId === 'new'
            ? <>Creating <strong>{newBandName.trim() || 'new band'}</strong> as a paid workspace</>
            : <>Upgrading <strong>{selectedBand?.name ?? 'this band'}</strong> — currently on {selectedBandPlanState.planLabel}</>}
        </p>
      ) : null}

      <div className="pricing-card-grid">
        {PLAN_CARDS.map((card) => {
          const Icon = card.icon;
          const creatingNewBand = selectedBandId === 'new';
          const selectedBandPlan = selectedBandPlanState.plan;
          const isCurrentPlan = !creatingNewBand && selectedBandPlan === card.tier;
          const displayPrice = billingCycle === 'annual' && card.annualPrice ? card.annualPrice : card.monthlyPrice;
          const priceSuffix = card.tier === 'free' ? '' : billingCycle === 'annual' ? '/year' : '/month';
          const ctaLabel = getCtaLabel(card, selectedBandPlan, isCurrentPlan, creatingNewBand);
          const freeTierLocked = card.tier === 'free' && creatingNewBand && ownedBands.length > 0;

          return (
            <section
              key={card.tier}
              className={[
                'pricing-card',
                card.tier === 'crew' ? 'pricing-card--band' : '',
                isCurrentPlan ? 'pricing-card--active' : '',
                freeTierLocked ? 'pricing-card--locked' : '',
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
                {card.featureBullets.map((feature) => {
                  const FeatureIcon = feature.icon;
                  return (
                    <li key={feature.label}>
                      <FeatureIcon size={16} />
                      <span>{feature.label}</span>
                    </li>
                  );
                })}
              </ul>
              {card.tier === 'crew' ? (
                <label className="share-menu-field" style={{ marginBottom: '0.85rem' }}>
                    <span>Extra members ({billingCycle === 'annual' ? '20 USD each per year' : '2 USD each per month'})</span>
                    <input
                      type="number"
                      min={0}
                      max={500}
                      value={extraMemberCount}
                      onChange={(event) => setExtraMemberCount(Number(event.target.value) || 0)}
                      disabled={busyTier === card.tier}
                    />
                  </label>
              ) : null}
              {freeTierLocked ? (
                <>
                  <button type="button" className="setlist-action-btn setlist-action-btn--secondary pricing-card-btn" disabled>
                    Unavailable
                  </button>
                  <p className="pricing-card-lock-note">
                    You already have a band workspace, so new ones need Pro or Crew.
                  </p>
                </>
              ) : card.tier === 'free' ? (
                <Link to="/profile" className="setlist-action-btn setlist-action-btn--secondary pricing-card-btn">
                  {ctaLabel}
                </Link>
              ) : (
                <button
                  type="button"
                  className="setlist-action-btn pricing-card-btn"
                  disabled={busyTier === card.tier || isCurrentPlan}
                  onClick={() => void handleCheckout(card)}
                >
                  {busyTier === card.tier ? 'Redirecting…' : ctaLabel}
                </button>
              )}
            </section>
          );
        })}
      </div>

      <p className="footer-links" style={{ display: 'block', marginTop: '1.5rem', textAlign: 'center' }}>
        By subscribing you agree to our <Link to="/terms">Terms</Link> and <Link to="/privacy">Privacy Policy</Link>.
      </p>
    </section>
  );
}