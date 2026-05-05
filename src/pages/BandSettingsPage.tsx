import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from '../utils/anchoredToast';
import { useBands } from '../context/BandsContext';
import { useAuth } from '../context/AuthContext';
import { ICON_OPTIONS } from '../lib/iconOptions';
import BandManagementPanel from '../components/BandManagementPanel';

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

    const normalizedIcon = normalizeEmojiIcon(icon);
    const nextColor = useAutoColor ? undefined : color;

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

    const currentIcon = band.icon;
    const currentColor = band.color;
    const appearanceChanged = currentIcon !== normalizedIcon || currentColor !== nextColor;

    if (appearanceChanged) {
      const appearanceError = await updateBandLibraryAppearance(band.id, {
        icon: normalizedIcon,
        color: nextColor,
      });

      if (appearanceError) {
        setBusy(false);
        toast.error(appearanceError);
        return;
      }
    }

    setBusy(false);
    toast.success('Band settings saved.');
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

      <Link to={`/bands/${band.id}/library`} className="setlist-action-btn setlist-action-btn--secondary">
        Back to band library
      </Link>

      <div className="modal-content">
        <section className="bands-panel">

          {/* ── Profile ── */}
          <h2 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 600, borderBottom: '1px solid var(--border-color, #e2e8f0)', paddingBottom: '0.5rem' }}>
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

          <div className="share-menu-field" style={{ marginTop: '0.75rem' }}>
            <span>Bio / description <span style={{ fontWeight: 400, opacity: 0.6 }}>({description.length}/240)</span></span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A short bio or description for your band"
              maxLength={240}
              rows={3}
              disabled={!canEditBand}
              style={{ resize: 'vertical', width: '100%', boxSizing: 'border-box' }}
            />
          </div>

          {/* ── Appearance ── */}
          <h2 style={{ margin: '1.5rem 0 1rem', fontSize: '1rem', fontWeight: 600, borderBottom: '1px solid var(--border-color, #e2e8f0)', paddingBottom: '0.5rem' }}>
            Appearance
          </h2>

          <div className="share-menu-field">
            <span>Icon</span>
          </div>
          <div className="emoji-choice-grid" role="listbox" aria-label="Band icon options" style={{ marginTop: '0.25rem' }}>
            {ICON_OPTIONS.map((emoji) => {
              const selected = icon === emoji;
              return (
                <button
                  key={emoji}
                  type="button"
                  className={`emoji-choice-btn${selected ? ' active' : ''}`}
                  onClick={() => setIcon(emoji)}
                  aria-label={`Choose icon ${emoji}`}
                  aria-pressed={selected}
                  disabled={!canEditBand}
                >
                  {emoji}
                </button>
              );
            })}
          </div>

          <div className="share-menu-field" style={{ marginTop: '1rem' }}>
            <span>Theme color</span>
          </div>
          <div className="color-swatch-grid" role="listbox" aria-label="Band color options" style={{ marginTop: '0.25rem' }}>
            {BAND_COLOR_OPTIONS.map((colorHex) => {
              const selected = !useAutoColor && color.toLowerCase() === colorHex.toLowerCase();
              return (
                <button
                  key={colorHex}
                  type="button"
                  className={`color-swatch-btn${selected ? ' active' : ''}`}
                  style={{ backgroundColor: colorHex }}
                  onClick={() => {
                    setColor(colorHex);
                    setUseAutoColor(false);
                  }}
                  aria-label={`Choose color ${colorHex}`}
                  aria-pressed={selected}
                  disabled={!canEditBand}
                />
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.5rem', flexWrap: 'wrap' }}>
            <div className="share-menu-field" style={{ flex: '0 0 auto', margin: 0 }}>
              <span>Custom</span>
              <input
                type="color"
                value={color}
                onChange={(e) => {
                  setColor(e.target.value);
                  setUseAutoColor(false);
                }}
                aria-label="Custom band color"
                disabled={!canEditBand}
              />
            </div>
            <button
              type="button"
              className={`setlist-action-btn setlist-action-btn--secondary${useAutoColor ? ' setlist-action-btn--active' : ''}`}
              onClick={() => setUseAutoColor(true)}
              disabled={!canEditBand}
            >
              Auto color
            </button>
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

        {/* ── Members ── */}
        <BandManagementPanel
          band={band}
          canEditBand={canEditBand}
          isOwner={isOwner}
        />
      </div>
    </section>
  );
}
