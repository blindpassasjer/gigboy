import { useEffect, useMemo, useState } from 'react';
import { Map, ClipboardList } from 'lucide-react';
import toast from '../utils/anchoredToast';
import type { Stageplot, InputList } from '../types';
import StageplotEditor from './StageplotEditor';
import InputListEditor from './InputListEditor';
import { useBands } from '../context/BandsContext';
import { showPromptToast } from '../utils/toastDialogs';
import { buildBandPublicShareUrl } from '../utils/publicShare';

type TabId = 'stageplots' | 'riders';

interface Props {
  bandId: string;
  bandName: string;
  stageplots: Stageplot[];
  riders: InputList[];
  canEdit: boolean;
  userId: string | null;
  userEmail: string | null;
  initialTab?: TabId;
  onTabChange?: (tab: TabId) => void;
}

export default function BandTechRiderPanel({
  bandId,
  bandName,
  stageplots,
  riders,
  canEdit,
  userId,
  userEmail,
  initialTab = 'stageplots',
  onTabChange,
}: Props) {
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);
  const [activeStageplotId, setActiveStageplotId] = useState<string | null>(null);
  const [activeRiderId, setActiveRiderId] = useState<string | null>(null);

  const activeStageplot = useMemo(
    () => stageplots.find((entry) => entry.id === activeStageplotId) ?? null,
    [activeStageplotId, stageplots],
  );
  const activeRider = useMemo(
    () => riders.find((entry) => entry.id === activeRiderId) ?? null,
    [activeRiderId, riders],
  );

  const {
    addBandStageplot,
    renameBandStageplot,
    updateBandStageplotIcon,
    setBandStageplotPublicShare,
    updateBandStageplotContent,
    deleteBandStageplot,
    addBandInputList,
    renameBandInputList,
    updateBandInputListIcon,
    setBandInputListPublicShare,
    updateBandInputListContent,
    deleteBandInputList,
  } = useBands();

  useEffect(() => {
    setActiveStageplotId((current) => {
      if (current && stageplots.some((entry) => entry.id === current)) return current;
      return stageplots[0]?.id ?? null;
    });
  }, [stageplots]);

  useEffect(() => {
    setActiveRiderId((current) => {
      if (current && riders.some((entry) => entry.id === current)) return current;
      return riders[0]?.id ?? null;
    });
  }, [riders]);

  useEffect(() => {
    setActiveTab((current) => (current === initialTab ? current : initialTab));
  }, [initialTab]);

  const handleCreateStageplot = async () => {
    if (!canEdit) {
      toast.error('Only band editors can create stageplots.');
      return;
    }
    const value = await showPromptToast('New stageplot name', {
      placeholder: 'Band stageplot name...',
      confirmLabel: 'Create stageplot',
      cancelLabel: 'Cancel',
    });
    const name = value?.trim() ?? '';
    if (!name) return;

    const result = await addBandStageplot(bandId, name);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    if (result.stageplotId) {
      setActiveStageplotId(result.stageplotId);
    }
  };

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

  const handleCopyStageplotPublicLink = async (stageplotId: string, alreadyEnabled: boolean | undefined) => {
    if (!alreadyEnabled) {
      const error = await setBandStageplotPublicShare(bandId, stageplotId, true);
      if (error) {
        toast.error(error);
        return;
      }
    }
    const publicUrl = buildBandPublicShareUrl(
      window.location.origin,
      bandId,
      bandName,
      'stageplots',
      stageplotId,
    );
    try {
      await navigator.clipboard.writeText(publicUrl);
      toast.success('Public link copied to clipboard!');
    } catch {
      toast.error(`Failed to copy. Share this link: ${publicUrl}`);
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
            <p className="setlist-subtitle">Manage stageplots and input lists for your band.</p>
          </div>
        </div>

        <div className="setlist-tabs" style={{ marginBottom: '0.8rem' }}>
          {([
            { id: 'stageplots', label: 'Stageplots', icon: <Map size={14} /> },
            { id: 'riders', label: 'Input Lists', icon: <ClipboardList size={14} /> },
          ] as const).map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`setlist-tab${activeTab === tab.id ? ' active' : ''}`}
              onClick={() => {
                setActiveTab(tab.id);
                onTabChange?.(tab.id);
              }}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {activeTab === 'stageplots' && (
          <div className="songlist-body" style={{ display: 'grid', gap: '0.8rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <p className="songlist-item-meta" style={{ margin: 0 }}>
                Create and manage stageplots for your band.
              </p>
              <button
                type="button"
                className="setlist-action-btn setlist-action-btn--secondary"
                onClick={() => void handleCreateStageplot()}
                disabled={!canEdit}
              >
                Create stageplot
              </button>
            </div>
            {stageplots.length === 0 ? (
              <p className="bands-status">No stageplots available yet.</p>
            ) : (
              stageplots.map((entry) => (
                <div key={entry.id} className="songlist-item" style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span className="songlist-item-title" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>
                    {entry.name}
                  </span>
                  <span className="songlist-item-meta">{entry.items.length} items</span>
                  <button
                    type="button"
                    className={`setlist-action-btn setlist-action-btn--secondary${activeStageplotId === entry.id ? ' setlist-action-btn--active' : ''}`}
                    onClick={() => setActiveStageplotId(entry.id)}
                  >
                    Edit
                  </button>
                </div>
              ))
            )}

            {activeStageplot ? (
              <StageplotEditor
                stageplot={activeStageplot}
                canEdit={canEdit}
                currentUser={{
                  id: userId,
                  name: userEmail ?? 'Unknown user',
                  avatar: null,
                }}
                onRename={async (name) => {
                  const error = await renameBandStageplot(bandId, activeStageplot.id, name);
                  if (error) toast.error(error);
                }}
                onUpdateIcon={async (icon) => {
                  const error = await updateBandStageplotIcon(bandId, activeStageplot.id, icon);
                  if (error) toast.error(error);
                }}
                onDelete={async () => {
                  const error = await deleteBandStageplot(bandId, activeStageplot.id);
                  if (error) {
                    toast.error(error);
                    return;
                  }
                  setActiveStageplotId(null);
                }}
                onSaveContent={async (items, drawingLayers) => {
                  const error = await updateBandStageplotContent({
                    bandId,
                    stageplotId: activeStageplot.id,
                    items,
                    drawingLayers,
                  });
                  if (error) {
                    toast.error(error);
                    throw new Error(error);
                  }
                }}
                onCopyPublicLink={async () => {
                  await handleCopyStageplotPublicLink(activeStageplot.id, activeStageplot.publicShareEnabled);
                }}
              />
            ) : null}
          </div>
        )}

        {activeTab === 'riders' && (
          <div className="songlist-body" style={{ display: 'grid', gap: '0.8rem' }}>
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
        )}
      </div>
    </section>
  );
}
