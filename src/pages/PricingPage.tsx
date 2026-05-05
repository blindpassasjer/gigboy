import { useState } from 'react';
import { Check, Lock, Sparkles, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import toast from '../utils/anchoredToast';
import { useAuth } from '../context/AuthContext';
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

const PLAN_CARDS: PlanCard[] = [
  {
    tier: 'free',
    icon: Lock,
    blurb: 'A lightweight solo account for trying Gigboy and keeping a small library.',
    monthlyPrice: 'Free',
    annualPrice: null,
    featureBullets: ['12 songs', '100 MB recording storage', 'Song lists', 'Single user account'],
    ctaLabel: 'Current free plan',
  },
  {
    tier: 'pro',
    icon: Sparkles,
    blurb: 'Everything a power user needs for rehearsals, setlists, recordings, and sharing.',
    monthlyPrice: '50 kr or 5 USD',
    annualPrice: '500 kr or 50 USD',
    featureBullets: ['Unlimited songs', '1 GB storage', 'Setlists, stage plots, riders', 'Recordings, metronome, pedal'],
    ctaLabel: 'Upgrade to Pro',
    envKeyMonthly: 'VITE_STRIPE_PRO_MONTHLY_PRICE_ID',
    envKeyAnnual: 'VITE_STRIPE_PRO_ANNUAL_PRICE_ID',
  },
  {
    tier: 'band',
    icon: Users,
    blurb: 'A shared workspace for a band owner with member access and room to grow.',
    monthlyPrice: '150 kr or 15 USD',
    annualPrice: '1500 kr or 150 USD',
    featureBullets: ['Unlimited songs', '5 GB storage', 'Up to 5 members included', 'Extra members are a Band-only add-on'],
    ctaLabel: 'Upgrade to Band',
    envKeyMonthly: 'VITE_STRIPE_BAND_MONTHLY_PRICE_ID',
    envKeyAnnual: 'VITE_STRIPE_BAND_ANNUAL_PRICE_ID',
  },
];

function resolvePriceId(card: PlanCard, cycle: BillingCycle) {
  const key = cycle === 'annual' ? card.envKeyAnnual : card.envKeyMonthly;
  if (!key) return null;
  return (import.meta.env[key] as string | undefined)?.trim() || null;
}

export default function PricingPage() {
  const { user } = useAuth();
  const { plan } = usePlan();
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly');
  const [busyTier, setBusyTier] = useState<PlanTier | null>(null);
  const [extraMemberCount, setExtraMemberCount] = useState(0);

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

    const isBandPlan = card.tier === 'band';
    const normalizedExtraMembers = isBandPlan ? Math.max(0, Math.min(500, Math.trunc(extraMemberCount))) : 0;
    const extraMemberPriceId = isBandPlan
      ? (
        billingCycle === 'annual'
          ? (import.meta.env.VITE_STRIPE_BAND_ANNUAL_EXTRA_MEMBER_PRICE_ID as string | undefined)
          : (import.meta.env.VITE_STRIPE_BAND_MONTHLY_EXTRA_MEMBER_PRICE_ID as string | undefined)
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
        <span className="pricing-kicker">Pricing</span>
        <h1>Simple tiers for solo players and bands</h1>
        <p>
          Start on Free, upgrade when you need collaboration, setlists, recordings, and shared band workflows.
        </p>
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

          return (
            <section
              key={card.tier}
              className={[
                'pricing-card',
                card.tier === 'band' ? 'pricing-card--band' : '',
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
              {card.tier === 'band' ? (
                <label className="share-menu-field" style={{ marginBottom: '0.85rem' }}>
                  <span>Extra members ({billingCycle === 'annual' ? '200 kr / 20 USD each per year' : '20 kr / 2 USD each per month'})</span>
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
              {card.tier === 'free' ? (
                <Link to="/profile" className="setlist-action-btn setlist-action-btn--secondary pricing-card-btn">
                  {isCurrentPlan ? card.ctaLabel : 'Use Free'}
                </Link>
              ) : (
                <button
                  type="button"
                  className="setlist-action-btn pricing-card-btn"
                  disabled={busyTier === card.tier || isCurrentPlan}
                  onClick={() => void handleCheckout(card)}
                >
                  {busyTier === card.tier ? 'Redirecting…' : isCurrentPlan ? `${PLAN_LABELS[card.tier]} active` : card.ctaLabel}
                </button>
              )}
            </section>
          );
        })}
      </div>

      <section className="pricing-comparison">
        <div className="pricing-comparison-header">
          <h2>Compare features</h2>
          <Link to="/profile" className="profile-settings-link">Back to account</Link>
        </div>
        <div className="pricing-table-wrap">
          <table className="pricing-table">
            <thead>
              <tr>
                <th>Feature</th>
                <th>Free</th>
                <th>Pro</th>
                <th>Band</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>Song library</td><td>12 songs</td><td>Unlimited</td><td>Unlimited</td></tr>
              <tr><td>Storage</td><td>100 MB</td><td>1 GB</td><td>5 GB</td></tr>
              <tr><td>Song lists</td><td>Yes</td><td>Yes</td><td>Yes</td></tr>
              <tr><td>Setlists</td><td>No</td><td>Yes</td><td>Yes</td></tr>
              <tr><td>Stage plots</td><td>No</td><td>Yes</td><td>Yes</td></tr>
              <tr><td>Technical rider</td><td>No</td><td>Yes</td><td>Yes</td></tr>
              <tr><td>Shareable links</td><td>No</td><td>Yes</td><td>Yes</td></tr>
              <tr><td>Bluetooth pedal</td><td>No</td><td>Yes</td><td>Yes</td></tr>
              <tr><td>Recordings</td><td>No</td><td>Yes</td><td>Yes</td></tr>
              <tr><td>Metronome</td><td>No</td><td>Yes</td><td>Yes</td></tr>
              <tr><td>Multi-user notes</td><td>No</td><td>Yes</td><td>Yes</td></tr>
              <tr><td>Members</td><td>1 owner</td><td>1 owner</td><td>Up to 5</td></tr>
              <tr><td>Extra members</td><td>—</td><td>—</td><td>Band add-on only: 20 kr / 2 USD monthly, 200 kr / 20 USD yearly</td></tr>
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}