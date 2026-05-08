import { useEffect, useState } from 'react';
import { ArrowLeft, CreditCard, Trash2 } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { collection, deleteField, doc, getDocs, query, setDoc } from 'firebase/firestore';
import toast from '../utils/anchoredToast';
import { useBands } from '../context/BandsContext';
import { useAuth } from '../context/AuthContext';
import BandManagementPanel from '../components/BandManagementPanel';
import { PLAN_LABELS } from '../lib/planLimits';
import { db } from '../lib/firebase';

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

const MEDIA_ITEMS_PER_PAGE = 16;

interface LogoAsset {
  id: string;
  title: string;
  url: string;
  storagePath?: string;
  createdAt?: string;
}

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
  const { user } = useAuth();
  const {
    bands,
    loading,
    renameBand,
    updateBandDescription,
    updateBandLibraryAppearance,
    updateBandLogo,
  } = useBands();

  const band = bands.find((entry) => entry.id === id) ?? null;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('🎵');
  const [color, setColor] = useState('#c33232');
  const [useAutoColor, setUseAutoColor] = useState(true);
  const [busyAppearance, setBusyAppearance] = useState(false);
  const [logo, setLogo] = useState<string | undefined>();
  const [logoAssets, setLogoAssets] = useState<LogoAsset[]>([]);
  const [loadingLogoAssets, setLoadingLogoAssets] = useState(false);
  const [busyLogo, setBusyLogo] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [logoPage, setLogoPage] = useState(1);

  useEffect(() => {
    if (!band) return;
    setName(band.name);
    setDescription(band.description ?? '');
    setIcon(band.icon ?? '🎵');
    setColor(band.color ?? '#c33232');
    setUseAutoColor(!band.color);
    setLogo(band.logo);
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

  const handleLogoSelect = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Logo file must be smaller than 5 MB.');
      return;
    }

    setBusyLogo(true);
    const logoError = await updateBandLogo(band.id, file);
    setBusyLogo(false);

    if (logoError) {
      toast.error(logoError);
    } else {
      toast.success('Logo uploaded.');
    }
  };

  const handleRemoveLogo = async () => {
    setBusyLogo(true);
    const logoError = await updateBandLogo(band.id, null);
    setBusyLogo(false);

    if (logoError) {
      toast.error(logoError);
    } else {
      setLogo(undefined);
      toast.success('Logo removed.');
    }
  };

  const handleUseLogoAsset = async (asset: LogoAsset) => {
    if (!canEditBand || !db || busyLogo) return;
    if (asset.url === logo) return;

    setBusyLogo(true);
    try {
      await setDoc(doc(db, 'bands', band.id), {
        logo: asset.url,
        logoStoragePath: deleteField(),
        updatedAt: new Date().toISOString(),
      }, { merge: true });
      setLogo(asset.url);
      toast.success('Band logo updated.');
    } catch {
      toast.error('Failed to update band logo.');
    } finally {
      setBusyLogo(false);
    }
  };

  const handleLogoDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      void handleLogoSelect(files[0]);
    }
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      void handleLogoSelect(e.target.files[0]);
    }
  };

  useEffect(() => {
    if (!band || !canEditBand) return;

    const trimmedName = name.trim();
    const trimmedDescription = description.trim();
    const currentDescription = band.description ?? '';
    const nameChanged = trimmedName !== band.name;
    const descriptionChanged = trimmedDescription !== currentDescription;

    if (!nameChanged && !descriptionChanged) return;
    if (!trimmedName) return;

    const timer = window.setTimeout(() => {
      void (async () => {
        if (trimmedName !== band.name) {
          const renameError = await renameBand(band.id, trimmedName);
          if (renameError) {
            toast.error(renameError);
            return;
          }
        }

        if (trimmedDescription !== currentDescription) {
          const descError = await updateBandDescription(band.id, trimmedDescription);
          if (descError) {
            toast.error(descError);
          }
        }
      })();
    }, 500);

    return () => {
      window.clearTimeout(timer);
    };
  }, [band, canEditBand, name, description, renameBand, updateBandDescription]);

  useEffect(() => {
    if (!band || !db) return;
    let mounted = true;
    setLoadingLogoAssets(true);

    void getDocs(query(collection(db, 'bands', band.id, 'pressKitImages')))
      .then((snapshot) => {
        if (!mounted) return;
        const assets = snapshot.docs
          .map((entry) => {
            const data = entry.data() as Record<string, unknown>;
            return {
              id: entry.id,
              title: typeof data.title === 'string' ? data.title : 'Image',
              url: typeof data.url === 'string' ? data.url : '',
              storagePath: typeof data.storagePath === 'string' ? data.storagePath : undefined,
              createdAt: typeof data.createdAt === 'string' ? data.createdAt : undefined,
            } as LogoAsset;
          })
          .filter((asset) => asset.url.length > 0)
          .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));

        setLogoAssets(assets);
      })
      .catch(() => {
        if (!mounted) return;
        toast.error('Failed to load logo assets.');
      })
      .finally(() => {
        if (mounted) setLoadingLogoAssets(false);
      });

    return () => {
      mounted = false;
    };
  }, [band, logo]);

  const currentLogoAsset = logo
    ? { id: 'current-band-logo', title: 'Current logo', url: logo }
    : null;
  const combinedLogoAssets = currentLogoAsset && !logoAssets.some((asset) => asset.url === currentLogoAsset.url)
    ? [currentLogoAsset, ...logoAssets]
    : logoAssets;
  const logoTotalPages = Math.max(1, Math.ceil(combinedLogoAssets.length / MEDIA_ITEMS_PER_PAGE));
  const logoPageStart = (logoPage - 1) * MEDIA_ITEMS_PER_PAGE;
  const pagedLogoAssets = combinedLogoAssets.slice(logoPageStart, logoPageStart + MEDIA_ITEMS_PER_PAGE);

  useEffect(() => {
    if (logoPage > logoTotalPages) {
      setLogoPage(logoTotalPages);
    }
  }, [logoPage, logoTotalPages]);

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

          {/* ── Band Logo ── */}
          <div className="bands-logo-section">
            <section className="bands-logo-upload-area">
              <header className="press-kit-section-header">
                <p className="press-kit-section-title">Band Logo</p>
                <p className="press-kit-section-hint">Upload and manage your logo like Press Kit images.</p>
              </header>

              {canEditBand && (
                <div
                  className={`bands-logo-upload-drop${dragActive ? ' active' : ''}`}
                  onDragOver={(e) => { e.preventDefault(); if (canEditBand && !busyLogo) setDragActive(true); }}
                  onDragLeave={() => setDragActive(false)}
                  onDrop={handleLogoDrop}
                  onClick={() => { if (canEditBand && !busyLogo) document.getElementById('band-logo-input')?.click(); }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && canEditBand && !busyLogo) document.getElementById('band-logo-input')?.click(); }}
                >
                  <p className="songlist-item-meta" style={{ margin: 0 }}>
                    {busyLogo ? 'Uploading…' : 'Drag & drop or click to upload logo'}
                  </p>
                </div>
              )}

              <input
                id="band-logo-input"
                type="file"
                accept="image/*"
                onChange={handleLogoChange}
                style={{ display: 'none' }}
                disabled={!canEditBand || busyLogo}
              />

              {!loadingLogoAssets && combinedLogoAssets.length === 0 && (
                <p className="bands-status">No logo uploaded yet.</p>
              )}

              {loadingLogoAssets && <p className="bands-status">Loading logo assets…</p>}

              {combinedLogoAssets.length > 0 && (
                <div className="bands-logo-grid" role="list" aria-label="Band logo assets">
                  {pagedLogoAssets.map((asset) => {
                    const isCurrent = asset.url === logo;
                    return (
                      <article key={asset.id} className="bands-logo-card" role="listitem">
                        <div className="bands-logo-card-image-wrap">
                          <img src={asset.url} alt={asset.title} className="bands-logo-card-image" />
                        </div>
                        <div className="bands-logo-card-footer">
                          <span className="bands-logo-card-title">{isCurrent ? 'Current logo' : asset.title}</span>
                          {canEditBand && !isCurrent && (
                            <button
                              type="button"
                              className="setlist-action-btn setlist-action-btn--secondary bands-logo-use-btn"
                              onClick={() => { void handleUseLogoAsset(asset); }}
                              disabled={busyLogo}
                            >
                              Use
                            </button>
                          )}
                          {canEditBand && isCurrent && (
                            <button
                              type="button"
                              className="title-rename-btn"
                              title="Remove logo"
                              onClick={() => { void handleRemoveLogo(); }}
                              disabled={busyLogo}
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}

              {combinedLogoAssets.length > MEDIA_ITEMS_PER_PAGE && (
                <div className="media-pagination">
                  <button
                    type="button"
                    className="setlist-action-btn setlist-action-btn--secondary"
                    onClick={() => setLogoPage((current) => Math.max(1, current - 1))}
                    disabled={logoPage <= 1}
                  >
                    Previous
                  </button>
                  <p className="bands-inline-note">Page {logoPage} of {logoTotalPages}</p>
                  <button
                    type="button"
                    className="setlist-action-btn setlist-action-btn--secondary"
                    onClick={() => setLogoPage((current) => Math.min(logoTotalPages, current + 1))}
                    disabled={logoPage >= logoTotalPages}
                  >
                    Next
                  </button>
                </div>
              )}
            </section>

            {/* Logo Info & Color */}
            <div className="bands-logo-color-group">
              <div>
                <p className="bands-logo-section-title">Logo Guidelines</p>
                <div className="bands-logo-info">
                  <p className="bands-logo-info-item">
                    <strong>Transparency:</strong> PNG files with transparent backgrounds work best and look professional on any theme.
                  </p>
                  <p className="bands-logo-info-item">
                    <strong>Size:</strong> Use square or wide logos (at least 400×400px). Keep file size under 5 MB.
                  </p>
                  <p className="bands-logo-info-item">
                    <strong>Format:</strong> PNG, JPG, WebP, or GIF formats are supported.
                  </p>
                  <p className="bands-logo-info-item">
                    <strong>Design:</strong> Solid colors or subtle gradients work well. Avoid intricate details that may not scale.
                  </p>
                </div>
              </div>
            </div>
          </div>

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
