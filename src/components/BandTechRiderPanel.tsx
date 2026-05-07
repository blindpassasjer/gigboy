import { useEffect, useMemo, useState } from 'react';
import { ClipboardList } from 'lucide-react';
import toast from '../utils/anchoredToast';
import type { InputList, Stageplot } from '../types';
import StageplotEditor from './StageplotEditor';
import InputListEditor from './InputListEditor';
import { useBands } from '../context/BandsContext';
import { showPromptToast } from '../utils/toastDialogs';
import { buildBandPublicShareUrl } from '../utils/publicShare';

interface Props {
  bandId: string;
  bandName: string;
  riders: InputList[];
  canEdit: boolean;
  userId: string | null;
  userEmail: string | null;
  initialRiderId?: string | null;
}

export default function BandTechRiderPanel({
  bandId,
  bandName,
  riders,
  canEdit,
  userId,
  userEmail,
  initialRiderId = null,
}: Props) {
  const [activeRiderId, setActiveRiderId] = useState<string | null>(null);

  const activeRider = useMemo(
    () => riders.find((entry) => entry.id === activeRiderId) ?? null,
    [activeRiderId, riders],
  );

  // Build a Stageplot-compatible object from the active rider for StageplotEditor
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
    addBandInputList,
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

  const handleCreateRider = async () => {
    if (!canEdit) {
      toast.error('Only band editors can create input lists.');
      return;
    }
    const value = await showPromptToast('New input list name', {
      placeholder: 'Band input list name...',
      confirmLabel: 'Create rider',
      cancelLabel: 'Cancel',
    });
    const name = value?.trim() ?? '';
    if (!name) return;

    const result = await addBandInputList(bandId, name);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    if (result.riderId) {
      setActiveRiderId(result.riderId);
    }
  };

  const handleCopyRiderPublicLink = async (riderId: string, alreadyEnabled: boolean | undefined) => {
    if (!alreadyEnabled) {
      const error = await setBandInputListPublicShare(bandId, riderId, true);
      if (error) {
        toast.error(error);
        return;
      }
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
        <div className="bands-header setlist-header">
          <div className="setlist-title-block">
            <h1 className="song-list-heading setlist-title">Technical Rider</h1>
            <p className="setlist-subtitle">Manage input lists and stageplots for your band.</p>
          </div>
        </div>

        <div className="tech-rider-sections">
          <div className="songlist-body tech-rider-section" role="region" aria-label="Input list section">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
              <ClipboardList size={16} />
              <h2 className="song-list-heading" style={{ margin: 0, fontSize: '1rem' }}>Input Lists</h2>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <p className="songlist-item-meta" style={{ margin: 0 }}>
                Create and manage input lists for your band.
              </p>
              <button
                type="button"
                className="setlist-action-btn setlist-action-btn--secondary"
                onClick={() => void handleCreateRider()}
                disabled={!canEdit}
              >
                Create rider
              </button>
            </div>
            {riders.length === 0 ? (
              <p className="bands-status">No input lists available yet.</p>
            ) : (
              riders.map((entry) => (
                <div key={entry.id} className="songlist-item" style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span className="songlist-item-title" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>
                    {entry.name}
                  </span>
                  <span className="songlist-item-meta">{entry.lines.length} lines</span>
                  <button
                    type="button"
                    className={`setlist-action-btn setlist-action-btn--secondary${activeRiderId === entry.id ? ' setlist-action-btn--active' : ''}`}
                    onClick={() => setActiveRiderId(entry.id)}
                  >
                    Edit
                  </button>
                </div>
              ))
            )}

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
                  if (error) {
                    toast.error(error);
                    return;
                  }
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
                  if (error) {
                    toast.error(error);
                    throw new Error(error);
                  }
                }}
                onCopyPublicLink={async () => {
                  await handleCopyRiderPublicLink(activeRider.id, activeRider.publicShareEnabled);
                }}
              />
            ) : null}
          </div>

          {activeRiderAsStageplot ? (
            <StageplotEditor
              stageplot={activeRiderAsStageplot}
              canEdit={canEdit}
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
                if (error) {
                  toast.error(error);
                  return;
                }
                setActiveRiderId(null);
              }}
              onSaveContent={async (items, drawingLayers) => {
                const error = await updateBandInputListStageplotContent({
                  bandId,
                  riderId: activeRiderAsStageplot.id,
                  items,
                  drawingLayers,
                });
                if (error) {
                  toast.error(error);
                  throw new Error(error);
                }
              }}
              onCopyPublicLink={async () => {
                await handleCopyRiderPublicLink(activeRiderAsStageplot.id, activeRiderAsStageplot.publicShareEnabled);
              }}
            />
          ) : null}
        </div>
      </div>
    </section>
  );
}
