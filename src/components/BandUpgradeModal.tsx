import { useState } from 'react';
import { X, Sparkles, Users } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useBands } from '../context/BandsContext';
import { createCheckoutSession } from '../lib/billingApi';
import toast from '../utils/anchoredToast';
import type { PlanTier } from '../types';

interface BandUpgradeModalProps {
  bandName: string;
  onClose: () => void;
  onBandCreated?: (bandId: string, plan: Exclude<PlanTier, 'free'>) => void;
}

type BillingCycle = 'monthly' | 'annual';

const STRIPE_PRICE_IDS = {
  pro: {
    monthly: 'price_1TTcMZQ9ZHGjaIIRVQd0Kkqr',
    annual: 'price_1TTd6uQ9ZHGjaIIRvkQ1SHbe',
  },
  crew: {
    monthly: 'price_1TTcSVQ9ZHGjaIIRqMNvXTgI',
    annual: 'price_1TTd2aQ9ZHGjaIIRIbNu0NKp',
  },
} as const;

const PLAN_INFO: Record<Exclude<PlanTier, 'free'>, {
  icon: typeof Sparkles | typeof Users;
  title: string;
  monthlyPrice: string;
  annualPrice: string;
  features: string[];
  description: string;
}> = {
  pro: {
    icon: Sparkles,
    title: 'Pro Band',
    monthlyPrice: '50 kr or 5 USD',
    annualPrice: '500 kr or 50 USD',
    description: 'Perfect for power users. Everything you need for rehearsals, setlists, recordings, and sharing.',
    features: [
      'Unlimited songs',
      '1 GB storage',
      'Setlists & stage plots',
      'Recordings & metronome',
      'Shareable links',
    ],
  },
  crew: {
    icon: Users,
    title: 'Crew Band',
    monthlyPrice: '150 kr or 15 USD',
    annualPrice: '1500 kr or 150 USD',
    description: 'Ideal for bands. A shared workspace with up to 5 members and powerful collaboration tools.',
    features: [
      'Unlimited songs',
      '5 GB storage',
      'Up to 5 members',
      'All Pro features',
      'Extra members: 20 kr / 2 USD monthly',
    ],
  },
};

export default function BandUpgradeModal({ bandName, onClose, onBandCreated }: BandUpgradeModalProps) {
  const { user } = useAuth();
  const { createBand } = useBands();
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly');
  const [loadingPlan, setLoadingPlan] = useState<PlanTier | null>(null);

  const handleUpgrade = async (plan: Exclude<PlanTier, 'free'>) => {
    if (!user?.id || !user?.email) {
      toast.error('You must be signed in to upgrade.');
      return;
    }

    setLoadingPlan(plan);
    try {
      // First, create the band as free (bypass the band limit check since we're immediately upgrading)
      const result = await createBand(bandName, undefined, undefined, { bypassBandLimitCheck: true });
      if (!result.bandId) {
        toast.error(result.error || 'Failed to create band.');
        setLoadingPlan(null);
        return;
      }

      const bandId = result.bandId;

      // Now start checkout to upgrade the band
      const priceId = STRIPE_PRICE_IDS[plan][billingCycle];
      const origin = window.location.origin;

      const checkoutResult = await createCheckoutSession({
        userId: user.id,
        userEmail: user.email,
        priceId,
        successUrl: `${origin}/checkout-result?status=success`,
        cancelUrl: `${origin}/checkout-result?status=cancel`,
        bandId, // Pass the newly created band ID
      });

      // Redirect to Stripe checkout
      window.location.href = checkoutResult.url;
      onBandCreated?.(bandId, plan);
    } catch (error) {
      console.error('Upgrade error:', error);
      toast.error('Failed to start checkout. Please try again.');
      setLoadingPlan(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 p-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              Create Band with a Paid Plan
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mt-1">
              You already have a free band. Additional bands require a Pro or Crew subscription. Create "{bandName}" with a paid plan.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex-shrink-0"
            aria-label="Close"
          >
            <X size={24} />
          </button>
        </div>

        {/* Billing Cycle Toggle */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-center gap-4">
            <span className={`text-sm font-medium ${billingCycle === 'monthly' ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}>
              Monthly
            </span>
            <button
              onClick={() => setBillingCycle(billingCycle === 'monthly' ? 'annual' : 'monthly')}
              className="relative inline-flex h-8 w-14 items-center rounded-full bg-gray-300 dark:bg-gray-700 transition-colors"
              style={{ backgroundColor: billingCycle === 'annual' ? '#3b82f6' : '#d1d5db' }}
            >
              <span
                className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
                  billingCycle === 'annual' ? 'translate-x-7' : 'translate-x-1'
                }`}
              />
            </button>
            <span className={`text-sm font-medium ${billingCycle === 'annual' ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}>
              Annual
              <span className="ml-2 text-xs text-green-600 dark:text-green-400">(Save 17%)</span>
            </span>
          </div>
        </div>

        {/* Plan Cards */}
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          {(['pro', 'crew'] as const).map((plan) => {
            const info = PLAN_INFO[plan];
            const Icon = info.icon;
            const currentPrice = billingCycle === 'annual' ? info.annualPrice : info.monthlyPrice;

            return (
              <div
                key={plan}
                className="border border-gray-200 dark:border-gray-700 rounded-lg p-6 flex flex-col transition-all hover:shadow-lg dark:hover:shadow-lg/20"
              >
                <div className="flex items-center gap-3 mb-4">
                  <Icon className="text-blue-600 dark:text-blue-400" size={24} />
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                    {info.title}
                  </h3>
                </div>

                <p className="text-gray-600 dark:text-gray-400 text-sm mb-4 flex-grow">
                  {info.description}
                </p>

                <div className="mb-6">
                  <div className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                    {currentPrice}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {billingCycle === 'annual' ? 'per year' : 'per month'}
                  </p>
                </div>

                <ul className="space-y-2 mb-6 flex-grow">
                  {info.features.map((feature, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                      <span className="text-green-600 dark:text-green-400 font-bold mt-0.5">✓</span>
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => handleUpgrade(plan)}
                  disabled={loadingPlan === plan || loadingPlan !== null}
                  className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium rounded-lg transition-colors"
                >
                  {loadingPlan === plan ? 'Processing...' : loadingPlan ? 'Creating band...' : `Create ${plan === 'pro' ? 'Pro' : 'Crew'} Band`}
                </button>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
          <button
            onClick={onClose}
            className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 text-sm font-medium"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
