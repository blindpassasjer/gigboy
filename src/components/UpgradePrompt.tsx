import { Lock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { ProFeature } from '../lib/planLimits';

interface Props {
  feature: ProFeature;
  /** One-line description of what's locked, e.g. "Recording songs" */
  label?: string;
}

export default function UpgradePrompt({ feature: _feature, label }: Props) {
  const navigate = useNavigate();
  return (
    <div className="upgrade-prompt" role="status" aria-label="Feature locked">
      <Lock size={14} className="upgrade-prompt__icon" aria-hidden="true" />
      <span className="upgrade-prompt__text">
        {label ?? 'This feature'} requires a Pro or Band plan.
      </span>
      <button
        type="button"
        className="upgrade-prompt__btn"
        onClick={() => navigate('/pricing')}
      >
        Upgrade
      </button>
    </div>
  );
}
