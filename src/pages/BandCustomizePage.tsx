import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ChevronDown, ChevronUp } from 'lucide-react';
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

export default function BandCustomizePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const {
    bands,
    loading,
    renameBand,
    updateBandLibraryAppearance,
  } = useBands();

  const band = bands.find((entry) => entry.id === id) ?? null;

  const [customizeName, setCustomizeName] = useState('');
  const [customizeIcon, setCustomizeIcon] = useState('🎵');
  const [customizeColor, setCustomizeColor] = useState('#c33232');
  const [useAutoColor, setUseAutoColor] = useState(true);
  const [busy, setBusy] = useState(false);
  const [iconOpen, setIconOpen] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);

  useEffect(() => {
    if (!band) return;
    setCustomizeName(band.name);
    setCustomizeIcon(band.icon ?? '🎵');
    setCustomizeColor(band.color ?? '#c33232');
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

    const trimmedName = customizeName.trim();
    if (!trimmedName) {
      toast.error('Band name is required.');
      return;
    }

    const normalizedIcon = normalizeEmojiIcon(customizeIcon);
    const nextColor = useAutoColor ? undefined : customizeColor;

    setBusy(true);

    if (trimmedName !== band.name) {
      const renameError = await renameBand(band.id, trimmedName);
      if (renameError) {
        setBusy(false);
        toast.error(renameError);
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
    toast.success('Band customization saved.');
    navigate(`/bands/${band.id}/library`);
  };

  return (
    <section className="bands-page">
      <header className="bands-header">
        <div>
          <h1>{band.name}</h1>
          <p>Customize this band's name and appearance.</p>
        </div>
      </header>

      <Link to={`/bands/${band.id}/library`} className="setlist-action-btn setlist-action-btn--secondary">
        Back to band library
      </Link>

      <div className="modal-content">
        <section className="bands-panel">
          <div className="share-menu-field">
            <span>Name</span>
            <input
              type="text"
              value={customizeName}
              onChange={(event) => setCustomizeName(event.target.value)}
              placeholder="Band name"
              maxLength={80}
            />
          </div>

          <button
            type="button"
            className="profile-settings-collapsible-toggle"
            onClick={() => setIconOpen((o) => !o)}
            aria-expanded={iconOpen}
            aria-controls="band-customize-icon-options"
            style={{ marginTop: '0.75rem', width: '100%', textAlign: 'left', paddingLeft: 0, paddingRight: 0 }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: 'inherit', fontWeight: 'inherit' }}>Icon</h3>
              {iconOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </div>
          </button>
          {iconOpen && (
            <div id="band-customize-icon-options" className="emoji-choice-grid" role="listbox" aria-label="Band icon options" style={{ marginTop: '0.5rem' }}>
              {ICON_OPTIONS.map((emoji) => {
                const selected = customizeIcon === emoji;
                return (
                  <button
                    key={emoji}
                    type="button"
                    className={`emoji-choice-btn${selected ? ' active' : ''}`}
                    onClick={() => setCustomizeIcon(emoji)}
                    aria-label={`Choose icon ${emoji}`}
                    aria-pressed={selected}
                  >
                    {emoji}
                  </button>
                );
              })}
            </div>
          )}

          <button
            type="button"
            className="profile-settings-collapsible-toggle"
            onClick={() => setColorOpen((o) => !o)}
            aria-expanded={colorOpen}
            aria-controls="band-customize-color-options"
            style={{ marginTop: '0.75rem', width: '100%', textAlign: 'left', paddingLeft: 0, paddingRight: 0 }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: 'inherit', fontWeight: 'inherit' }}>Color</h3>
              {colorOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </div>
          </button>
          {colorOpen && (
            <div id="band-customize-color-options" style={{ marginTop: '0.5rem' }}>
              <div className="color-swatch-grid" role="listbox" aria-label="Band color options">
              {BAND_COLOR_OPTIONS.map((colorHex) => {
                const selected = !useAutoColor && customizeColor.toLowerCase() === colorHex.toLowerCase();
                return (
                  <button
                    key={colorHex}
                    type="button"
                    className={`color-swatch-btn${selected ? ' active' : ''}`}
                    style={{ backgroundColor: colorHex }}
                    onClick={() => {
                      setCustomizeColor(colorHex);
                      setUseAutoColor(false);
                    }}
                    aria-label={`Choose color ${colorHex}`}
                    aria-pressed={selected}
                  />
                );
              })}
              </div>
              <div className="share-menu-field" style={{ marginTop: '0.5rem' }}>
              <span>Custom color</span>
              <input
                type="color"
                value={customizeColor}
                onChange={(event) => {
                  setCustomizeColor(event.target.value);
                  setUseAutoColor(false);
                }}
                aria-label="Custom band color"
              />
            </div>
              <button
                type="button"
                className={`setlist-action-btn setlist-action-btn--secondary${useAutoColor ? ' setlist-action-btn--active' : ''}`}
                onClick={() => setUseAutoColor(true)}
              >
                Use auto color
              </button>
            </div>
          )}

          <div style={{ display: 'flex', gap: '.5rem', marginTop: '1rem' }}>
            <button
              type="button"
              className="setlist-action-btn"
              onClick={() => void handleSave()}
              disabled={busy}
            >
              {busy ? 'Saving...' : 'Save'}
            </button>
            <Link
              to={`/bands/${band.id}/library`}
              className="setlist-action-btn setlist-action-btn--secondary"
            >
              Cancel
            </Link>
          </div>
        </section>

        <BandManagementPanel
          band={band}
          canEditBand={canEditBand}
          isOwner={isOwner}
        />
      </div>
    </section>
  );
}
