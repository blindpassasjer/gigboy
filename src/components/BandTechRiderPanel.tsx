import { useEffect, useMemo, useState } from 'react';
import toast from '../utils/anchoredToast';
import type { InputList, Stageplot } from '../types';
import StageplotEditor from './StageplotEditor';
import InputListEditor from './InputListEditor';
import { useBands } from '../context/BandsContext';
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
        <div className="setlist-header songlist-header tech-rider-page-header">
          <div className="setlist-title-block">
            <h1 className="song-list-heading setlist-title">Technical Rider</h1>
            <p className="setlist-subtitle">Manage input lists and stageplots for your band.</p>
          </div>
        </div>

        <div className="tech-rider-sections">
          <div className="tech-rider-section" role="region" aria-label="Technical rider view">
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
                showHeader
              />
            ) : (
              <p className="bands-status">No technical riders available yet.</p>
            )}

            {riders.length > 1 ? (
              <div className="songlist-body tech-rider-list-card">
                <p className="songlist-item-meta">Switch rider</p>
                {riders.map((entry) => (
                  <div key={entry.id} className="songlist-item tech-rider-list-item">
                    <span className="songlist-item-title">{entry.name}</span>
                    <span className="songlist-item-meta">{entry.lines.length} lines</span>
                    <button
                      type="button"
                      className={`setlist-action-btn setlist-action-btn--secondary${activeRiderId === entry.id ? ' setlist-action-btn--active' : ''}`}
                      onClick={() => setActiveRiderId(entry.id)}
                    >
                      Open
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div className="tech-rider-section" role="region" aria-label="Stageplot view">
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
                showHeader
              />
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
