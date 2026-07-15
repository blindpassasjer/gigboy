import type { ReactNode } from 'react';
import { usePlan } from '../hooks/usePlan';
import UpgradePrompt from './UpgradePrompt';
import type { ProFeature } from '../lib/planLimits';

interface Props {
  feature: ProFeature;
  /** Shown inside the UpgradePrompt when locked. */
  label?: string;
  children: ReactNode;
}

/**
 * Renders `children` when the current user's plan has access to `feature`.
 * Otherwise renders an inline UpgradePrompt.
 */
export default function PlanGate({ feature, label, children }: Props) {
  const { canUse } = usePlan();
  if (canUse(feature)) return <>{children}</>;
  return <UpgradePrompt feature={feature} label={label} />;
}
