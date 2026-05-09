import { useEffect, useMemo, useRef, useState } from 'react';
import { ClipboardList, Link2, PenLine, Trash2 } from 'lucide-react';
import toast from '../utils/anchoredToast';
import type { InputList, Stageplot } from '../types';
import StageplotEditor from './StageplotEditor';
import InputListEditor from './InputListEditor';
import { useBands } from '../context/BandsContext';
import { buildBandPublicShareUrl } from '../utils/publicShare';
import { showConfirmToast } from '../utils/toastDialogs';
import { ICON_OPTIONS } from '../lib/iconOptions';

interface Props {
  bandId: string;
  bandName: string;
  riders: InputList[];
  canEdit: boolean;
  userId: string | null;
  userEmail: string | null;
  initialRiderId?: string | null;
  autoStartRenameToken?: string | number | null;
}

function normalizeEmojiIcon(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return [...trimmed].slice(0, 2).join('');
}

export default function BandTechRiderPanel({
  bandId,
  bandName,
  riders,
  canEdit,
  userId,
  userEmail,
  initialRiderId = null,
  autoStartRenameToken = null,
}: Props) {
  const [activeRiderId, setActiveRiderId] = useState<string | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [showIconEditor, setShowIconEditor] = useState(false);
  const [iconDraft, setIconDraft] = useState('🎤');
  const [toolbarPortalTarget, setToolbarPortalTarget] = useState<HTMLElement | null>(null);
  const iconPickerRef = useRef<HTMLDivElement | null>(null);
  const iconTriggerRef = useRef<HTMLButtonElement | null>(null);
  const renameInputRef = useRef<HTMLInputElement | null>(null);

  const activeRider = useMemo(
    () => riders.find((entry) => entry.id === activeRiderId) ?? null,
    [activeRiderId, riders],
  );

  const activeRiderAsStageplot = useMemo<Stageplot | null>(() => {
    if (!activeRider) return null;
    return {
      id: activeRider.id,
      name: activeRider.name,
      icon: activeRider.icon,
      items: activeRider.items ?? [],
      drawingLayers: activeRider.drawingLayers ?? [],
      stageShape: activeRider.stageShape,
      stageSize: activeRider.stageSize,
      publicShareEnabled: activeRider.publicShareEnabled,
      bandName: activeRider.bandName,
      sortOrder: activeRider.sortOrder,
      createdAt: activeRider.createdAt,
      updatedAt: activeRider.updatedAt,
      ownerId: activeRider.ownerId,
      collaboratorIds: activeRider.collaboratorIds,
      collaborationPermissions: activeRider.collaborationPermissions,
      accessRole: activeRider.accessRole,
    };
  }, [activeRider]);

  const {
    renameBandInputList,
    updateBandInputListIcon,
    setBandInputListPublicShare,
    updateBandInputListContent,
    updateBandInputListStageplotContent,
    deleteBandInputList,
  } = useBands();

  useEffect(() => {
    setActiveRiderId((current) => {
      if (current && riders.some((entry) => entry.id === current)) return current;
      if (initialRiderId && riders.some((entry) => entry.id === initialRiderId)) return initialRiderId;
      return riders[0]?.id ?? null;
    });
  }, [initialRiderId, riders]);

  useEffect(() => {
    if (!activeRider) {
      setRenameValue('');
      setIsRenaming(false);
      setShowIconEditor(false);
      return;
    }
    setRenameValue(activeRider.name);
    setIsRenaming(false);
    setIconDraft(activeRider.icon ?? '🎤');
  }, [activeRider]);

  useEffect(() => {
    if (!showIconEditor) return;
    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (iconPickerRef.current?.contains(target)) return;
      if (iconTriggerRef.current?.contains(target)) return;
      setShowIconEditor(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setShowIconEditor(false);
      iconTriggerRef.current?.focus();
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showIconEditor]);

  useEffect(() => {
    if (!isRenaming) return;
    renameInputRef.current?.focus();
    renameInputRef.current?.select();
  }, [isRenaming]);

  useEffect(() => {
    if (!canEdit || !activeRider || autoStartRenameToken == null) return;
    setRenameValue(activeRider.name);
    setIsRenaming(true);
  }, [activeRider, autoStartRenameToken, canEdit]);

  const handleUpdateRiderIcon = async (icon?: string) => {
    if (!activeRider) return;
    const error = await updateBandInputListIcon(bandId, activeRider.id, icon);
    if (error) { toast.error(error); return; }
    setIconDraft(icon ?? '🎤');
    setShowIconEditor(false);
  };

  const handleRenameCommit = async () => {
    if (!activeRider) return;
    const trimmed = renameValue.trim();
    if (!trimmed) { setRenameValue(activeRider.name); setIsRenaming(false); return; }
    if (trimmed !== activeRider.name) {
      const error = await renameBandInputList(bandId, activeRider.id, trimmed);
      if (error) { toast.error(error); return; }
    }
    setIsRenaming(false);
  };

  const handleDeleteActiveRider = async () => {
    if (!activeRider || !canEdit) return;
    const confirmed = await showConfirmToast(`Move rider "${activeRider.name}" to trash?`, {
      confirmLabel: 'Move to trash',
    });
    if (!confirmed) return;
    const error = await deleteBandInputList(bandId, activeRider.id);
    if (error) { toast.error(error); return; }
    setActiveRiderId(null);
  };

  const handleCopyRiderPublicLink = async (riderId: string, alreadyEnabled: boolean | undefined) => {
    if (!alreadyEnabled) {
      const error = await setBandInputListPublicShare(bandId, riderId, true);
      if (error) { toast.error(error); return; }
    }
    const publicUrl = buildBandPublicShareUrl(
      window.location.origin,
      bandId,
      bandName,
      'riders',
      riderId,
    );
    try {
      await navigator.clipboard.writeText(publicUrl);
      toast.success('Public link copied to clipboard!');
    } catch {
      toast.error(`Failed to copy. Share this link: ${publicUrl}`);
    }
  };

  return (
    <section className="bands-page bands-page--library">
      <div className="setlist-shell">

        <div className="song-list-sticky">
          <header className="songlist-header bands-header setlist-header">
            <div className="setlist-title-block">
              {isRenaming && canEdit && activeRider ? (
                <input
                  ref={renameInputRef}
                  type="text"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleRenameCommit();
                    if (e.key === 'Escape') { setRenameValue(activeRider.name); setIsRenaming(false); }
                  }}
                  onBlur={() => void handleRenameCommit()}
                  className="setlist-name-input"
                  autoFocus
                />
              ) : (
                <div className="song-list-title-row">
                  <h1 className="song-list-heading setlist-title">
                    {canEdit && activeRider ? (
                      <div className="icon-picker-wrapper" ref={iconPickerRef}>
                        <button
                          ref={iconTriggerRef}
                          type="button"
                          className={`icon-picker-trigger${showIconEditor ? ' is-open' : ''}`}
                          aria-haspopup="dialog"
                          aria-expanded={showIconEditor}
                          onClick={(e) => { e.stopPropagation(); setShowIconEditor((v) => !v); }}
                          title="Change rider icon"
                          aria-label="Change rider icon"
                        >
                          <span className="song-list-heading-icon" aria-hidden="true">
                            {activeRider.icon ? activeRider.icon : <ClipboardList size={20} />}
                          </span>
                        </button>
                        {showIconEditor && (
                          <div className="icon-picker-popover" role="dialog" aria-label="Choose rider icon">
                            <div className="emoji-choice-grid" role="radiogroup" aria-label="Rider icon options">
                              <button
                                type="button"
                                className={`emoji-choice-btn${!activeRider.icon ? ' active' : ''}`}
                                onClick={() => void handleUpdateRiderIcon(undefined)}
                                aria-pressed={!activeRider.icon}
                              >
                                <ClipboardList size={16} />
                              </button>
                              {ICON_OPTIONS.map((emoji) => {
                                const selected = iconDraft === emoji;
                                return (
                                  <button
                                    key={emoji}
                                    type="button"
                                    className={`emoji-choice-btn${selected ? ' active' : ''}`}
                                    onClick={() => void handleUpdateRiderIcon(normalizeEmojiIcon(emoji))}
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
                              onClick={() => void handleUpdateRiderIcon(undefined)}
                            >
                              Reset to default
                            </button>
                          </div>
                        )}
                      </div>
                    ) : activeRider?.icon ? (
                      <span className="song-list-heading-icon" aria-hidden="true">{activeRider.icon}</span>
                    ) : null}
                    {activeRider?.name ?? 'Technical Rider'}
                  </h1>
                  {canEdit && activeRider ? (
                    <button
                      type="button"
                      className="title-rename-btn"
                      onClick={() => setIsRenaming(true)}
                      title="Rename rider"
                    >
                      <PenLine size={14} />
                    </button>
                  ) : null}
                </div>
              )}
              <p className="setlist-subtitle">Manage input lists and stageplots for your band.</p>
            </div>
            <div className="setlist-header-actions">
              {activeRider ? (
                <button
                  type="button"
                  className="setlist-action-btn setlist-action-btn--accent"
                  onClick={() => void handleCopyRiderPublicLink(activeRider.id, activeRider.publicShareEnabled)}
                  title={activeRider.publicShareEnabled ? 'Copy public link' : 'Create & copy public link'}
                >
                  <Link2 size={14} />
                </button>
              ) : null}
              {canEdit && activeRider ? (
                <button
                  type="button"
                  className="setlist-action-btn setlist-action-btn--secondary"
                  onClick={() => void handleDeleteActiveRider()}
                  title={`Delete rider ${activeRider.name}`}
                >
                  <Trash2 size={14} />
                </button>
              ) : null}
            </div>
          </header>
        </div>

        <div className="tech-rider-sections">
          <section className="tech-rider-section" aria-label="Technical rider view">
            {activeRider ? (
              <InputListEditor
                rider={activeRider}
                canEdit={canEdit}
                onRename={async (name) => {
                  const error = await renameBandInputList(bandId, activeRider.id, name);
                  if (error) toast.error(error);
                }}
                onUpdateIcon={async (icon) => {
                  const error = await updateBandInputListIcon(bandId, activeRider.id, icon);
                  if (error) toast.error(error);
                }}
                onDelete={canEdit ? async () => {
                  const error = await deleteBandInputList(bandId, activeRider.id);
                  if (error) { toast.error(error); return; }
                  setActiveRiderId(null);
                } : undefined}
                onSaveContent={async (content) => {
                  const error = await updateBandInputListContent({
                    bandId,
                    riderId: activeRider.id,
                    lines: content.lines,
                    preferredEquipment: content.preferredEquipment,
                    inventoryEquipment: content.inventoryEquipment,
                  });
                  if (error) { toast.error(error); throw new Error(error); }
                }}
                onCopyPublicLink={async () => {
                  await handleCopyRiderPublicLink(activeRider.id, activeRider.publicShareEnabled);
                }}
                showHeader={false}
              />
            ) : (
              <p className="bands-status">No technical riders available yet.</p>
            )}
          </section>

          <section className="tech-rider-section" aria-label="Stageplot view">
            <section className="technical-rider-section">
              <div className="technical-rider-section-header">
                <h2>Stagerider</h2>
              </div>
            <div ref={(el) => setToolbarPortalTarget(el)} />
            {activeRiderAsStageplot ? (
              <StageplotEditor
                stageplot={activeRiderAsStageplot}
                canEdit={canEdit}
                toolbarPortalTarget={toolbarPortalTarget}
                currentUser={{
                  id: userId,
                  name: userEmail ?? 'Unknown user',
                  avatar: null,
                }}
                onRename={async (name) => {
                  const error = await renameBandInputList(bandId, activeRiderAsStageplot.id, name);
                  if (error) toast.error(error);
                }}
                onUpdateIcon={async (icon) => {
                  const error = await updateBandInputListIcon(bandId, activeRiderAsStageplot.id, icon);
                  if (error) toast.error(error);
                }}
                onDelete={async () => {
                  const error = await deleteBandInputList(bandId, activeRiderAsStageplot.id);
                  if (error) { toast.error(error); return; }
                  setActiveRiderId(null);
                }}
                onSaveContent={async (items, drawingLayers) => {
                  const error = await updateBandInputListStageplotContent({
                    bandId,
                    riderId: activeRiderAsStageplot.id,
                    items,
                    drawingLayers,
                  });
                  if (error) { toast.error(error); throw new Error(error); }
                }}
                onCopyPublicLink={async () => {
                  await handleCopyRiderPublicLink(activeRiderAsStageplot.id, activeRiderAsStageplot.publicShareEnabled);
                }}
                showHeader={false}
              />
            ) : null}
            </section>
          </section>
        </div>

      </div>
    </section>
  );
}
