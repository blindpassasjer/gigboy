import { useEffect, useState } from 'react';
import { ArrowLeft, CreditCard } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from '../utils/anchoredToast';
import { useBands } from '../context/BandsContext';
import { useAuth } from '../context/AuthContext';
import BandManagementPanel from '../components/BandManagementPanel';
import { PLAN_LABELS } from '../lib/planLimits';

const BAND_COLOR_OPTIONS = [
  '#c33232',
  '#d35400',
  '#a66e00',
  '#2e7d32',
  '#00897b',
  '#0288d1',
  '#1565c0',
  '#5e35b1',
  '#ad1457',
  '#6d4c41',
  '#455a64',
  '#37474f',
] as const;

function normalizeEmojiIcon(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return [...trimmed].slice(0, 2).join('');
}

function formatPeriodEnd(value: number | null | undefined) {
  if (!value) return null;
  const normalized = value > 1_000_000_000_000 ? value : value * 1000;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

function formatSubscriptionStatus(status: string | null | undefined) {
  if (!status) return 'Not subscribed';
  return status.replace('_', ' ');
}

export default function BandSettingsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const {
    bands,
    loading,
    renameBand,
    updateBandDescription,
    updateBandLibraryAppearance,
  } = useBands();

  const band = bands.find((entry) => entry.id === id) ?? null;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('🎵');
  const [color, setColor] = useState('#c33232');
  const [useAutoColor, setUseAutoColor] = useState(true);
  const [busy, setBusy] = useState(false);
  const [busyAppearance, setBusyAppearance] = useState(false);

  useEffect(() => {
    if (!band) return;
    setName(band.name);
    setDescription(band.description ?? '');
    setIcon(band.icon ?? '🎵');
    setColor(band.color ?? '#c33232');
    setUseAutoColor(!band.color);
  }, [band]);

  if (loading && !band) {
    return <p className="bands-status">Loading band…</p>;
  }

  if (!band || !id) {
    return (
      <section className="bands-page">
        <p className="bands-status">Band not found.</p>
        <Link to="/profile" className="setlist-action-btn setlist-action-btn--secondary">Back to bands</Link>
      </section>
    );
  }

  const isOwner = band.ownerId === user?.id;
  const canEditBand = isOwner || band.memberRoles[user?.id ?? ''] === 'editor';
  const bandPlan = band.billingPlan ?? 'free';
  const memberLimit = band.billingMemberLimit
    ?? (bandPlan === 'band' ? 5 + (band.billingExtraMembers ?? 0) : (isOwner ? user?.memberLimit ?? null : null));
  const renewalDate = formatPeriodEnd(band.billingCurrentPeriodEnd ?? null);

  const applyAppearance = async (nextIcon: string, nextColor: string | undefined) => {
    if (!canEditBand || busyAppearance) return;

    setBusyAppearance(true);
    const appearanceError = await updateBandLibraryAppearance(band.id, {
      icon: normalizeEmojiIcon(nextIcon),
      color: nextColor,
    });
    setBusyAppearance(false);

    if (appearanceError) {
      toast.error(appearanceError);
    }
  };

  const handleColorSelect = async (nextColor: string) => {
    setColor(nextColor);
    setUseAutoColor(false);
    await applyAppearance(icon, nextColor);
  };

  const handleAutoColor = async () => {
    setUseAutoColor(true);
    await applyAppearance(icon, undefined);
  };

  const handleSave = async () => {
    if (!canEditBand) {
      navigate(`/bands/${band.id}/library`);
      return;
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error('Band name is required.');
      return;
    }

    if (description.length > 240) {
      toast.error('Description must be 240 characters or fewer.');
      return;
    }

    setBusy(true);

    if (trimmedName !== band.name) {
      const renameError = await renameBand(band.id, trimmedName);
      if (renameError) {
        setBusy(false);
        toast.error(renameError);
        return;
      }
    }

    const trimmedDescription = description.trim();
    if (trimmedDescription !== (band.description ?? '')) {
      const descError = await updateBandDescription(band.id, trimmedDescription);
      if (descError) {
        setBusy(false);
        toast.error(descError);
        return;
      }
    }

    setBusy(false);
    toast.success('Band profile saved.');
    navigate(`/bands/${band.id}/library`);
  };

  return (
    <section className="bands-page">
      <header className="bands-header">
        <div>
          <h1>Band Settings</h1>
          <p>{band.name}</p>
        </div>
      </header>

      <Link to={`/bands/${band.id}/library`} className="back-link">
        <ArrowLeft size={16} /> Back to band library
      </Link>

      <div className="bands-settings-layout">
        <section className="bands-panel bands-settings-left">

          {/* ── Profile ── */}
          <h2 className="bands-section-heading">
            Profile
          </h2>

          <div className="share-menu-field">
            <span>Band name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Band name"
              maxLength={80}
              disabled={!canEditBand}
            />
          </div>

          <div className="share-menu-field">
            <span>Bio / description <span className="bands-field-counter">({description.length}/240)</span></span>
            <textarea
              className="bands-description-field"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A short bio or description for your band"
              maxLength={240}
              rows={3}
              disabled={!canEditBand}
            />
          </div>

          {/* ── Appearance ── */}
          <h2 className="bands-section-heading bands-section-heading--spaced">
            Appearance
          </h2>

          <div className="share-menu-field">
            <span>Theme color</span>
          </div>
          <div className="color-swatch-grid" role="listbox" aria-label="Band color options">
            {BAND_COLOR_OPTIONS.map((colorHex) => {
              const selected = !useAutoColor && color.toLowerCase() === colorHex.toLowerCase();
              return (
                <button
                  key={colorHex}
                  type="button"
                  className={`color-swatch-btn${selected ? ' active' : ''}`}
                  style={{ backgroundColor: colorHex }}
                  onClick={() => { void handleColorSelect(colorHex); }}
                  aria-label={`Choose color ${colorHex}`}
                  aria-pressed={selected}
                  disabled={!canEditBand || busyAppearance}
                />
              );
            })}
          </div>
          <div className="bands-color-controls">
            <div className="share-menu-field bands-color-custom-field">
              <span>Custom</span>
              <input
                type="color"
                value={color}
                onChange={(e) => { void handleColorSelect(e.target.value); }}
                aria-label="Custom band color"
                disabled={!canEditBand || busyAppearance}
              />
            </div>
            <button
              type="button"
              className={`setlist-action-btn setlist-action-btn--secondary${useAutoColor ? ' setlist-action-btn--active' : ''}`}
              onClick={() => { void handleAutoColor(); }}
              disabled={!canEditBand || busyAppearance}
            >
              Auto color
            </button>
            <p className="bands-inline-note">Color updates immediately.</p>
          </div>

          {/* ── Actions ── */}
          {canEditBand && (
            <div style={{ display: 'flex', gap: '.5rem', marginTop: '1.5rem' }}>
              <button
                type="button"
                className="setlist-action-btn"
                onClick={() => void handleSave()}
                disabled={busy}
              >
                {busy ? 'Saving…' : 'Save changes'}
              </button>
              <Link
                to={`/bands/${band.id}/library`}
                className="setlist-action-btn setlist-action-btn--secondary"
              >
                Cancel
              </Link>
            </div>
          )}
        </section>

        <div className="bands-settings-left">
          <section className="bands-panel">
            <h2 className="bands-section-heading">Subscription</h2>
            <div className="bands-subscription-row">
              <div className="bands-subscription-copy">
                <strong>{PLAN_LABELS[bandPlan]}</strong>
                <span>{formatSubscriptionStatus(band.billingSubscriptionStatus ?? null)}</span>
                <span>{renewalDate ? `Renews ${renewalDate}` : 'No recurring band subscription'}</span>
              </div>
              {isOwner ? (
                <Link
                  to="/pricing"
                  state={{ bandId: band.id }}
                  className="setlist-action-btn setlist-action-btn--secondary"
                >
                  <CreditCard size={15} /> Open billing
                </Link>
              ) : null}
            </div>
            <div className="bands-subscription-row">
              <div className="bands-subscription-copy">
                <strong>Member capacity</strong>
                <span>
                  {memberLimit
                    ? `${memberLimit} member${memberLimit === 1 ? '' : 's'} included for this band`
                    : 'Capacity is managed through the band owner account'}
                </span>
                <span>{band.memberIds.length} currently in the band</span>
              </div>
            </div>
          </section>

          <BandManagementPanel
            band={band}
            canEditBand={canEditBand}
            isOwner={isOwner}
          />
        </div>
      </div>
    </section>
  );
}
