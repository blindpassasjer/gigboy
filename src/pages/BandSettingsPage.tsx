import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, CreditCard, Trash2, X, ArrowDownToLine } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { collection, deleteField, doc, getDocs, query, setDoc } from 'firebase/firestore';
import toast from '../utils/anchoredToast';
import { showConfirmToast } from '../utils/toastDialogs';
import { useBands } from '../context/BandsContext';
import { useAuth } from '../context/AuthContext';
import BandManagementPanel from '../components/BandManagementPanel';
import { useBandPlan } from '../hooks/usePlan';
import { db } from '../lib/firebase';
import { ICON_OPTIONS } from '../lib/iconOptions';

const LOGO_CARD_MIN_WIDTH_PX = 130;
const LOGO_GRID_GAP_PX = 10;
const LOGO_GRID_ROWS_PER_PAGE = 4;

function normalizeEmojiIcon(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return [...trimmed].slice(0, 2).join('');
}

function inferImageExtension(url: string, mimeType: string): string {
  const normalizedMime = mimeType.split(';')[0].trim().toLowerCase();
  const fromMime = normalizedMime.startsWith('image/') ? normalizedMime.slice(6) : '';
  if (fromMime) return fromMime;

  const pathname = new URL(url, window.location.origin).pathname;
  const fileName = pathname.split('/').pop() ?? '';
  const ext = fileName.includes('.') ? fileName.split('.').pop() ?? '' : '';
  return ext.toLowerCase() || 'jpg';
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const blobUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = blobUrl;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(blobUrl);
}

interface LogoAsset {
  id: string;
  title: string;
  url: string;
  thumbUrl?: string;
  storagePath?: string;
  thumbStoragePath?: string;
  createdAt?: string;
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
    updateBandLogo,
    deleteBand,
  } = useBands();

  const band = bands.find((entry) => entry.id === id) ?? null;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('🎵');
  const [iconDraft, setIconDraft] = useState('🎵');
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [busyAppearance, setBusyAppearance] = useState(false);
  const iconPickerRef = useRef<HTMLDivElement | null>(null);
  const iconTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [logo, setLogo] = useState<string | undefined>();
  const [logoAssets, setLogoAssets] = useState<LogoAsset[]>([]);
  const [loadingLogoAssets, setLoadingLogoAssets] = useState(false);
  const [busyLogo, setBusyLogo] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [logoPage, setLogoPage] = useState(1);
  const [logoItemsPerPage, setLogoItemsPerPage] = useState(8);
  const [logoPreview, setLogoPreview] = useState<{ url: string; title: string } | null>(null);
  const [downloadingLogoId, setDownloadingLogoId] = useState<string | null>(null);
  const [busyDeleteBand, setBusyDeleteBand] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const logoGridRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!band) return;
    setName(band.name);
    setDescription(band.description ?? '');
    setIcon(band.icon ?? '🎵');
    setIconDraft(band.icon ?? '🎵');
    setLogo(band.logo);
  // Intentionally depends only on band.id — resets form when switching bands,
  // not on every property change (which would overwrite the user's in-progress edits).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [band?.id]);

  const bandId = band?.id ?? null;
  const isOwner = band?.ownerId === user?.id;
  const canEditBand = isOwner;
  const bandPlanState = useBandPlan(band);
  const memberLimit = band?.billingMemberLimit
    ?? (bandPlanState.isCrew ? 5 + (band?.billingExtraMembers ?? 0) : (isOwner ? user?.memberLimit ?? null : null));
  const planFromBand = band?.billingPlan === 'pro' || band?.billingPlan === 'crew';
  const effectiveStatus = planFromBand ? (band?.billingSubscriptionStatus ?? null) : (user?.subscriptionStatus ?? null);
  const renewalDate = formatPeriodEnd(planFromBand ? (band?.billingCurrentPeriodEnd ?? null) : (user?.currentPeriodEnd ?? null));

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
    if (!bandId || !db) return;
    let mounted = true;
    setLoadingLogoAssets(true);

    void getDocs(query(collection(db, 'bands', bandId, 'pressKitImages')))
      .then((snapshot) => {
        if (!mounted) return;
        const assets = snapshot.docs
          .map((entry) => {
            const data = entry.data() as Record<string, unknown>;
            return {
              id: entry.id,
              title: typeof data.title === 'string' ? data.title : 'Image',
              url: typeof data.url === 'string' ? data.url : '',
              thumbUrl: typeof data.thumbUrl === 'string' ? data.thumbUrl : undefined,
              storagePath: typeof data.storagePath === 'string' ? data.storagePath : undefined,
              thumbStoragePath: typeof data.thumbStoragePath === 'string' ? data.thumbStoragePath : undefined,
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
  }, [bandId]);

  const currentLogoAsset = logo
    ? { id: 'current-band-logo', title: 'Current logo', url: logo, thumbUrl: logo }
    : null;
  const combinedLogoAssets = currentLogoAsset && !logoAssets.some((asset) => asset.url === currentLogoAsset.url)
    ? [currentLogoAsset, ...logoAssets]
    : logoAssets;
  const logoTotalPages = Math.max(1, Math.ceil(combinedLogoAssets.length / logoItemsPerPage));
  const logoPageStart = (logoPage - 1) * logoItemsPerPage;
  const pagedLogoAssets = combinedLogoAssets.slice(logoPageStart, logoPageStart + logoItemsPerPage);

  useEffect(() => {
    const computeItemsPerPage = () => {
      const containerWidth = logoGridRef.current?.clientWidth ?? window.innerWidth;
      const columns = Math.max(1, Math.floor((containerWidth + LOGO_GRID_GAP_PX) / (LOGO_CARD_MIN_WIDTH_PX + LOGO_GRID_GAP_PX)));
      setLogoItemsPerPage(columns * LOGO_GRID_ROWS_PER_PAGE);
    };

    computeItemsPerPage();

    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => {
          computeItemsPerPage();
        })
      : null;

    if (logoGridRef.current && resizeObserver) {
      resizeObserver.observe(logoGridRef.current);
    }

    window.addEventListener('resize', computeItemsPerPage);

    return () => {
      window.removeEventListener('resize', computeItemsPerPage);
      resizeObserver?.disconnect();
    };
  }, []);

  useEffect(() => {
    if (logoPage > logoTotalPages) {
      setLogoPage(logoTotalPages);
    }
  }, [logoPage, logoTotalPages]);

  useEffect(() => {
    if (!logoPreview) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setLogoPreview(null);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [logoPreview]);

  useEffect(() => {
    if (!showIconPicker) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (iconPickerRef.current?.contains(target)) return;
      if (iconTriggerRef.current?.contains(target)) return;
      setShowIconPicker(false);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowIconPicker(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showIconPicker]);

  const handleLogoDownload = async (asset: LogoAsset) => {
    setDownloadingLogoId(asset.id);
    try {
      const response = await fetch(asset.url);
      if (!response.ok) throw new Error('Failed to download logo.');
      const blob = await response.blob();
      const ext = inferImageExtension(asset.url, blob.type);
      const safeName = (asset.title || 'logo')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '') || 'logo';
      triggerBlobDownload(blob, `${safeName}.${ext}`);
    } catch {
      toast.error('Failed to download logo.');
    } finally {
      setDownloadingLogoId(null);
    }
  };

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

  if (!isOwner) {
    return (
      <section className="bands-page">
        <p className="bands-status">Only the band owner can access band settings.</p>
        <Link to={`/bands/${band.id}/members`} className="setlist-action-btn setlist-action-btn--secondary">
          <ArrowLeft size={16} /> Back to members
        </Link>
      </section>
    );
  }

  const handleIconSelect = async (nextIcon: string | undefined) => {
    setIconDraft(nextIcon ?? '🎵');
    setIcon(nextIcon ?? '🎵');
    setShowIconPicker(false);
    if (!canEditBand || busyAppearance) return;
    setBusyAppearance(true);
    const error = await updateBandLibraryAppearance(band.id, { icon: nextIcon ? normalizeEmojiIcon(nextIcon) : undefined });
    setBusyAppearance(false);
    if (error) toast.error(error);
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
    const confirmed = await showConfirmToast('Remove the current band logo?', {
      confirmLabel: 'Remove logo',
    });
    if (!confirmed) return;

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

  const handleDeleteBand = async () => {
    if (deleteConfirmName !== band.name) return;

    setBusyDeleteBand(true);
    const error = await deleteBand(band.id);
    setBusyDeleteBand(false);

    if (error) {
      toast.error(error);
      return;
    }

    toast.success('Band deleted.');
    navigate('/bands');
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
        <div className="bands-settings-left">
          <section className="bands-panel">

          {/* ── Profile ── */}
          <h2 className="bands-section-heading">
            Profile
          </h2>

          <div className="share-menu-field">
            <span>Band name</span>
            <div className="song-list-title-row">
              {canEditBand && (
                <div className="icon-picker-wrapper" ref={iconPickerRef}>
                  <button
                    ref={iconTriggerRef}
                    type="button"
                    className={`icon-picker-trigger${showIconPicker ? ' is-open' : ''}`}
                    aria-haspopup="dialog"
                    aria-expanded={showIconPicker}
                    onClick={(e) => { e.stopPropagation(); setShowIconPicker((v) => !v); }}
                    title="Change band icon"
                    aria-label="Change band icon"
                    disabled={busyAppearance}
                  >
                    <span className="resource-title-icon" aria-hidden="true">{icon}</span>
                  </button>
                  {showIconPicker && (
                    <div className="icon-picker-popover" role="dialog" aria-label="Choose band icon">
                      <div className="emoji-choice-grid" role="radiogroup" aria-label="Band icon options">
                        {ICON_OPTIONS.map((emoji) => {
                          const selected = iconDraft === emoji;
                          return (
                            <button
                              key={emoji}
                              type="button"
                              className={`emoji-choice-btn${selected ? ' active' : ''}`}
                              onClick={() => { void handleIconSelect(emoji); }}
                              aria-label={`Choose icon ${emoji}`}
                              aria-pressed={selected}
                            >
                              {emoji}
                            </button>
                          );
                        })}
                      </div>
                      <button
                        type="button"
                        className="icon-picker-reset-btn"
                        onClick={() => { void handleIconSelect(undefined); }}
                      >
                        Reset to default
                      </button>
                    </div>
                  )}
                </div>
              )}
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Band name"
                maxLength={80}
                disabled={!canEditBand}
              />
            </div>
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

          </section>

          {/* ── Appearance ── */}
          <section className="bands-panel">
            <h2 className="bands-section-heading">
              Appearance
            </h2>

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
                <div className="bands-logo-grid" role="list" aria-label="Band logo assets" ref={logoGridRef}>
                  {pagedLogoAssets.map((asset) => {
                    const isCurrent = asset.url === logo;
                    return (
                      <article key={asset.id} className="bands-logo-card" role="listitem">
                        <div className="bands-logo-card-image-wrap">
                          <button
                            type="button"
                            className="image-preview-trigger"
                            onClick={() => setLogoPreview({ url: asset.url, title: isCurrent ? 'Current logo' : asset.title })}
                            aria-label={`Preview ${isCurrent ? 'current logo' : asset.title}`}
                          >
                            <img
                              src={asset.thumbUrl ?? asset.url}
                              alt={asset.title}
                              loading="lazy"
                              decoding="async"
                              className="bands-logo-card-image"
                            />
                          </button>
                        </div>
                        <div className="bands-logo-card-footer">
                          <span className="bands-logo-card-title">{isCurrent ? 'Current logo' : asset.title}</span>
                          <button
                            type="button"
                            className="title-rename-btn"
                            title="Download logo"
                            onClick={() => { void handleLogoDownload(asset); }}
                            disabled={downloadingLogoId === asset.id}
                          >
                            <ArrowDownToLine size={13} />
                          </button>
                          {canEditBand && (
                            <button
                              type="button"
                              className="title-rename-btn"
                              title="Delete logo"
                              onClick={() => { void handleRemoveLogo(); }}
                              disabled={busyLogo}
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
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
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}

              {combinedLogoAssets.length > logoItemsPerPage && (
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
            </div>

        </section>
        </div>

        <div className="bands-settings-left">
          <section className="bands-panel">
            <h2 className="bands-section-heading">Subscription</h2>
            <div className="bands-subscription-row">
              <div className="bands-subscription-copy">
                <strong>{bandPlanState.planLabel}</strong>
                <span>{bandPlanState.planOverride ? 'Complimentary' : formatSubscriptionStatus(effectiveStatus)}</span>
                <span>{renewalDate ? `Renews ${renewalDate}` : planFromBand ? 'No recurring band subscription' : bandPlanState.isFree ? 'No active subscription' : 'Managed through your account'}</span>
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

          {isOwner && (
            <section className="bands-panel bands-panel--danger">
              <h3>Danger zone</h3>
              {showDeleteConfirm ? (
                <div className="bands-delete-confirm">
                  <p>Type <strong>{band.name}</strong> to confirm deletion. This cannot be undone.</p>
                  <label className="share-menu-field">
                    <input
                      type="text"
                      value={deleteConfirmName}
                      onChange={(e) => setDeleteConfirmName(e.target.value)}
                      placeholder={band.name}
                      autoFocus
                    />
                  </label>
                  <div className="bands-delete-confirm-actions">
                    <button
                      type="button"
                      className="setlist-action-btn setlist-action-btn--danger"
                      disabled={busyDeleteBand || deleteConfirmName !== band.name}
                      onClick={() => void handleDeleteBand()}
                    >
                      {busyDeleteBand ? 'Deleting…' : 'Delete band'}
                    </button>
                    <button
                      type="button"
                      className="setlist-action-btn setlist-action-btn--secondary"
                      disabled={busyDeleteBand}
                      onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmName(''); }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className="setlist-action-btn setlist-action-btn--danger"
                  onClick={() => setShowDeleteConfirm(true)}
                >
                  Delete band
                </button>
              )}
            </section>
          )}
        </div>
      </div>

      {logoPreview && (
        <div className="image-lightbox-overlay" onClick={() => setLogoPreview(null)} role="dialog" aria-modal="true" aria-label={`${logoPreview.title} preview`}>
          <div className="image-lightbox" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="image-lightbox-close"
              onClick={() => setLogoPreview(null)}
              title="Close preview"
              aria-label="Close preview"
            >
              <X size={18} />
            </button>
            <img src={logoPreview.url} alt={logoPreview.title} className="image-lightbox-image" />
            <p className="image-lightbox-caption">{logoPreview.title}</p>
          </div>
        </div>
      )}
    </section>
  );
}
