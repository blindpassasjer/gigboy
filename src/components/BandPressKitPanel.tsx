import { useEffect, useMemo, useState } from 'react';
import { Download, ExternalLink, FileText, Images, Map, ClipboardList } from 'lucide-react';
import { collection, deleteDoc, doc, getDocs, query, setDoc } from 'firebase/firestore';
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import toast from '../utils/anchoredToast';
import type { Stageplot, InputList } from '../types';
import { createPressKitShare } from '../lib/pressKitApi';
import { db, storage } from '../lib/firebase';
import { generatePressKitZip, type PressKitImageItem, type PressKitTextItem } from '../lib/pressKitZip';
import StageplotEditor from './StageplotEditor';
import InputListEditor from './InputListEditor';
import { useBands } from '../context/BandsContext';
import { showPromptToast } from '../utils/toastDialogs';
import { buildBandPublicShareUrl } from '../utils/publicShare';

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

type TabId = 'stageplots' | 'riders' | 'texts' | 'images';

interface PressKitImageAsset extends PressKitImageItem {
  id: string;
  storagePath?: string;
  mimeType?: string;
  sizeBytes?: number;
  createdAt?: string;
}

function slugifyFileName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'press-kit';
}

function sanitizePathSegment(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'image';
}

export default function BandPressKitPanel({
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
  const [selectedStageplotIds, setSelectedStageplotIds] = useState<string[]>([]);
  const [selectedRiderIds, setSelectedRiderIds] = useState<string[]>([]);
  const [activeStageplotId, setActiveStageplotId] = useState<string | null>(null);
  const [activeRiderId, setActiveRiderId] = useState<string | null>(null);
  const [texts, setTexts] = useState<Array<PressKitTextItem & { id: string }>>([]);
  const [imageAssets, setImageAssets] = useState<PressKitImageAsset[]>([]);
  const [selectedImageIds, setSelectedImageIds] = useState<string[]>([]);
  const [textTitleDraft, setTextTitleDraft] = useState('');
  const [textBodyDraft, setTextBodyDraft] = useState('');
  const [busyDownload, setBusyDownload] = useState(false);
  const [busyShare, setBusyShare] = useState(false);
  const [busyImageUpload, setBusyImageUpload] = useState(false);
  const [loadingImageAssets, setLoadingImageAssets] = useState(false);
  const [imageDropActive, setImageDropActive] = useState(false);

  const selectedStageplots = useMemo(
    () => stageplots.filter((entry) => selectedStageplotIds.includes(entry.id)),
    [selectedStageplotIds, stageplots]
  );
  const activeStageplot = useMemo(
    () => stageplots.find((entry) => entry.id === activeStageplotId) ?? null,
    [activeStageplotId, stageplots]
  );
  const selectedRiders = useMemo(
    () => riders.filter((entry) => selectedRiderIds.includes(entry.id)),
    [selectedRiderIds, riders]
  );
  const activeRider = useMemo(
    () => riders.find((entry) => entry.id === activeRiderId) ?? null,
    [activeRiderId, riders]
  );
  const selectedImages = useMemo(
    () => imageAssets.filter((entry) => selectedImageIds.includes(entry.id)),
    [imageAssets, selectedImageIds]
  );
  const allImageIds = useMemo(() => imageAssets.map((entry) => entry.id), [imageAssets]);
  const allImagesSelected = imageAssets.length > 0 && selectedImageIds.length === imageAssets.length;
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
    setSelectedStageplotIds((current) => current.filter((id) => stageplots.some((entry) => entry.id === id)));
    setActiveStageplotId((current) => {
      if (current && stageplots.some((entry) => entry.id === current)) return current;
      return stageplots[0]?.id ?? null;
    });
  }, [stageplots]);

  useEffect(() => {
    setSelectedRiderIds((current) => current.filter((id) => riders.some((entry) => entry.id === id)));
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
      setSelectedStageplotIds((current) => [...new Set([...current, result.stageplotId as string])]);
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
      setSelectedRiderIds((current) => [...new Set([...current, result.riderId as string])]);
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
      stageplotId
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
      riderId
    );

    try {
      await navigator.clipboard.writeText(publicUrl);
      toast.success('Public link copied to clipboard!');
    } catch {
      toast.error(`Failed to copy. Share this link: ${publicUrl}`);
    }
  };

  useEffect(() => {
    if (!db) return;

    let mounted = true;
    setLoadingImageAssets(true);

    void getDocs(query(collection(db, 'bands', bandId, 'pressKitImages')))
      .then((snapshot) => {
        if (!mounted) return;
        const assets = snapshot.docs.map((entry) => {
          const data = entry.data() as Record<string, unknown>;
          return {
            id: entry.id,
            title: typeof data.title === 'string' ? data.title : 'Image',
            url: typeof data.url === 'string' ? data.url : '',
            storagePath: typeof data.storagePath === 'string' ? data.storagePath : undefined,
            mimeType: typeof data.mimeType === 'string' ? data.mimeType : undefined,
            sizeBytes: typeof data.sizeBytes === 'number' ? data.sizeBytes : undefined,
            createdAt: typeof data.createdAt === 'string' ? data.createdAt : undefined,
          } as PressKitImageAsset;
        })
          .filter((asset) => asset.url.length > 0)
          .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
        setImageAssets(assets);
      })
      .catch((error) => {
        console.error('Failed to load press kit image assets from bands/' + bandId + '/pressKitImages:', error);
        if (!mounted) return;
        const errorMsg = error?.code === 'permission-denied'
          ? 'You do not have permission to view press kit images.'
          : 'Failed to load press kit image assets.';
        toast.error(errorMsg);
      })
      .finally(() => {
        if (!mounted) return;
        setLoadingImageAssets(false);
      });

    return () => {
      mounted = false;
    };
  }, [bandId]);

  const hasSelections =
    selectedStageplots.length > 0
    || selectedRiders.length > 0
    || texts.length > 0
    || selectedImages.length > 0;

  const handleDownloadZip = async () => {
    if (!hasSelections) {
      toast.error('Select at least one item before generating a ZIP.');
      return;
    }

    setBusyDownload(true);
    try {
      const blob = await generatePressKitZip({
        bandName,
        stageplots: selectedStageplots.map((entry) => ({
          id: entry.id,
          name: entry.name,
          icon: entry.icon,
          items: entry.items,
          stageShape: entry.stageShape,
          stageSize: entry.stageSize,
          updatedAt: entry.updatedAt,
        })),
        riders: selectedRiders.map((entry) => ({
          id: entry.id,
          name: entry.name,
          icon: entry.icon,
          lines: entry.lines,
          preferredEquipment: entry.preferredEquipment,
          inventoryEquipment: entry.inventoryEquipment,
          updatedAt: entry.updatedAt,
        })),
        texts,
        images: selectedImages,
        generatedAt: new Date().toISOString(),
      });

      const blobUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = blobUrl;
      anchor.download = `${slugifyFileName(bandName)}-press-kit.zip`;
      anchor.click();
      URL.revokeObjectURL(blobUrl);
      toast.success('Press kit ZIP generated.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to generate ZIP.';
      toast.error(message);
    } finally {
      setBusyDownload(false);
    }
  };

  const handleCreateShare = async () => {
    if (!canEdit) {
      toast.error('Only band editors can create share links.');
      return;
    }
    if (!userId || !userEmail) {
      toast.error('You must be signed in to create share links.');
      return;
    }
    if (!hasSelections) {
      toast.error('Select at least one item before creating a share link.');
      return;
    }

    setBusyShare(true);
    try {
      const result = await createPressKitShare({
        userId,
        userEmail,
        bandId,
        selectedStageplotIds,
        selectedRiderIds,
        texts: texts.map((entry) => ({ title: entry.title, body: entry.body })),
        images: selectedImages.map((entry) => ({ title: entry.title, url: entry.url })),
      });

      await navigator.clipboard.writeText(result.publicUrl);
      toast.success('Public press kit link copied to clipboard.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create share link.';
      toast.error(message);
    } finally {
      setBusyShare(false);
    }
  };

  const handleUploadImages = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (!canEdit) {
      toast.error('Only band editors can upload image assets.');
      return;
    }
    if (!storage) {
      toast.error('Storage is not configured for this deployment.');
      return;
    }
    const storageInstance = storage;

    const acceptedFiles = Array.from(files).filter((file) => file.type.startsWith('image/'));
    if (acceptedFiles.length === 0) {
      toast.error('Choose at least one image file.');
      return;
    }

    setBusyImageUpload(true);
    try {
      const uploaded = await Promise.all(acceptedFiles.map(async (file) => {
        const fileExt = file.name.includes('.') ? file.name.split('.').pop()?.toLowerCase() ?? 'bin' : 'bin';
        const imageId = crypto.randomUUID();
        const storagePath = `bands/${bandId}/presskit/images/${imageId}-${sanitizePathSegment(file.name)}.${fileExt}`;
        const storageRef = ref(storageInstance, storagePath);
        await uploadBytes(storageRef, file, { contentType: file.type || undefined });
        try {
          const url = await getDownloadURL(storageRef);
          const title = file.name.replace(/\.[^.]+$/, '').trim() || 'Image';
          const createdAt = new Date().toISOString();

          if (db) {
            await setDoc(doc(db, 'bands', bandId, 'pressKitImages', imageId), {
              title,
              url,
              storagePath,
              mimeType: file.type || null,
              sizeBytes: file.size,
              createdAt,
              createdBy: userId || null,
            });
          }

          return {
            id: imageId,
            title,
            url,
            storagePath,
            mimeType: file.type || undefined,
            sizeBytes: file.size,
            createdAt,
          } as PressKitImageAsset;
        } catch (error) {
          void deleteObject(storageRef).catch(() => {
            // Ignore cleanup failures when metadata write fails.
          });
          throw error;
        }
      }));

      setImageAssets((current) => {
        const next = [...uploaded, ...current.filter((entry) => !uploaded.some((newEntry) => newEntry.id === entry.id))];
        return next;
      });
      setSelectedImageIds((current) => [...new Set([...current, ...uploaded.map((entry) => entry.id)])]);
      toast.success(`Uploaded ${uploaded.length} image asset${uploaded.length === 1 ? '' : 's'}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to upload image assets.';
      toast.error(message);
    } finally {
      setBusyImageUpload(false);
    }
  };

  const removeImageAsset = async (asset: PressKitImageAsset) => {
    if (!canEdit) return;

    if (storage && asset.storagePath) {
      await deleteObject(ref(storage, asset.storagePath)).catch(() => {
        // Ignore cleanup failures; Firestore cleanup still runs.
      });
    }

    if (db) {
      await deleteDoc(doc(db, 'bands', bandId, 'pressKitImages', asset.id)).catch(() => {
        // Ignore Firestore cleanup failures so user can continue.
      });
    }

    setImageAssets((current) => current.filter((entry) => entry.id !== asset.id));
    setSelectedImageIds((current) => current.filter((id) => id !== asset.id));
  };

  return (
    <section className="bands-page bands-page--library">
      <div className="setlist-shell">
        <header className="setlist-header">
          <div className="setlist-header-main">
            <h1 className="setlist-title">Press Kit</h1>
            <p className="setlist-subtitle">Select assets and generate a downloadable promo package.</p>
          </div>
          <div className="setlist-actions" style={{ gap: '0.5rem' }}>
            <button
              type="button"
              className="setlist-action-btn setlist-action-btn--secondary"
              onClick={() => void handleDownloadZip()}
              disabled={busyDownload || !hasSelections}
              title="Generate ZIP"
            >
              <Download size={14} />
            </button>
            <button
              type="button"
              className="setlist-action-btn setlist-action-btn--secondary"
              onClick={() => void handleCreateShare()}
              disabled={busyShare || !hasSelections || !canEdit}
              title="Create and copy public share link"
            >
              <ExternalLink size={14} />
            </button>
          </div>
        </header>

        <div className="setlist-tabs" style={{ marginBottom: '0.8rem' }}>
          {([
            { id: 'stageplots', label: 'Stageplots', icon: <Map size={14} /> },
            { id: 'riders', label: 'Input Lists', icon: <ClipboardList size={14} /> },
            { id: 'texts', label: 'Texts', icon: <FileText size={14} /> },
            { id: 'images', label: 'Images', icon: <Images size={14} /> },
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
                Manage stageplots and select which ones are included in this Press Kit.
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
              stageplots.map((entry) => {
                const checked = selectedStageplotIds.includes(entry.id);
                return (
                  <div key={entry.id} className="songlist-item" style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', justifyContent: 'space-between' }}>
                    <label style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', margin: 0, flex: 1, minWidth: 0 }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => {
                          setSelectedStageplotIds((current) => (
                            event.target.checked
                              ? [...current, entry.id]
                              : current.filter((id) => id !== entry.id)
                          ));
                        }}
                      />
                      <span className="songlist-item-title" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.name}</span>
                      <span className="songlist-item-meta">{entry.items.length} items</span>
                    </label>
                    <button
                      type="button"
                      className={`setlist-action-btn setlist-action-btn--secondary${activeStageplotId === entry.id ? ' setlist-action-btn--active' : ''}`}
                      onClick={() => setActiveStageplotId(entry.id)}
                    >
                      Edit
                    </button>
                  </div>
                );
              })
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
                  setSelectedStageplotIds((current) => current.filter((id) => id !== activeStageplot.id));
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
                Manage input lists and select which ones are included in this Press Kit.
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
              riders.map((entry) => {
                const checked = selectedRiderIds.includes(entry.id);
                return (
                  <div key={entry.id} className="songlist-item" style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', justifyContent: 'space-between' }}>
                    <label style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', margin: 0, flex: 1, minWidth: 0 }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => {
                          setSelectedRiderIds((current) => (
                            event.target.checked
                              ? [...current, entry.id]
                              : current.filter((id) => id !== entry.id)
                          ));
                        }}
                      />
                      <span className="songlist-item-title" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.name}</span>
                      <span className="songlist-item-meta">{entry.lines.length} lines</span>
                    </label>
                    <button
                      type="button"
                      className={`setlist-action-btn setlist-action-btn--secondary${activeRiderId === entry.id ? ' setlist-action-btn--active' : ''}`}
                      onClick={() => setActiveRiderId(entry.id)}
                    >
                      Edit
                    </button>
                  </div>
                );
              })
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
                  setSelectedRiderIds((current) => current.filter((id) => id !== activeRider.id));
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

        {activeTab === 'texts' && (
          <div className="songlist-body" style={{ gap: '0.75rem', display: 'grid' }}>
            <div className="setlist-notes-editor">
              <input
                type="text"
                value={textTitleDraft}
                onChange={(event) => setTextTitleDraft(event.target.value)}
                placeholder="Text title (for example: Short Bio)"
                className="songlist-name-input"
                disabled={!canEdit}
              />
              <textarea
                value={textBodyDraft}
                onChange={(event) => setTextBodyDraft(event.target.value)}
                placeholder="Write your text content here"
                rows={6}
                className="setlist-song-note-input"
                disabled={!canEdit}
              />
              <button
                type="button"
                className="setlist-action-btn setlist-action-btn--secondary"
                disabled={!canEdit}
                onClick={() => {
                  const title = textTitleDraft.trim();
                  const body = textBodyDraft.trim();
                  if (!title || !body) {
                    toast.error('Title and text body are required.');
                    return;
                  }
                  setTexts((current) => [...current, { id: crypto.randomUUID(), title, body }]);
                  setTextTitleDraft('');
                  setTextBodyDraft('');
                }}
              >
                Add Text
              </button>
            </div>

            {texts.length === 0 ? <p className="bands-status">No text entries added.</p> : texts.map((entry) => (
              <article key={entry.id} className="songlist-item" style={{ display: 'block' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
                  <strong>{entry.title}</strong>
                  {canEdit && (
                    <button
                      type="button"
                      className="setlist-action-btn setlist-action-btn--danger"
                      onClick={() => setTexts((current) => current.filter((item) => item.id !== entry.id))}
                    >
                      Remove
                    </button>
                  )}
                </div>
                <p className="songlist-item-meta" style={{ whiteSpace: 'pre-wrap', marginTop: '0.5rem' }}>{entry.body}</p>
              </article>
            ))}
          </div>
        )}

        {activeTab === 'images' && (
          <div className="songlist-body" style={{ gap: '0.75rem', display: 'grid' }}>
            <div className="setlist-notes-editor">
              <div
                role="button"
                tabIndex={0}
                onDragOver={(event) => {
                  event.preventDefault();
                  if (!canEdit || busyImageUpload) return;
                  setImageDropActive(true);
                }}
                onDragLeave={() => setImageDropActive(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  if (!canEdit || busyImageUpload) return;
                  setImageDropActive(false);
                  void handleUploadImages(event.dataTransfer.files);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    const input = document.getElementById('press-kit-image-upload-input');
                    if (input instanceof HTMLInputElement) input.click();
                  }
                }}
                style={{
                  border: imageDropActive ? '2px solid var(--bands-hue)' : '1px dashed var(--border)',
                  borderRadius: '10px',
                  padding: '0.8rem',
                  background: imageDropActive ? 'var(--bands-hue-soft)' : 'var(--surface)',
                  cursor: canEdit ? 'pointer' : 'default',
                }}
              >
                <p className="songlist-item-meta" style={{ margin: 0 }}>
                  Drag and drop image files here, or click to upload.
                </p>
              </div>
              <input
                id="press-kit-image-upload-input"
                type="file"
                accept="image/*"
                multiple
                disabled={!canEdit || busyImageUpload}
                onChange={(event) => {
                  const { files } = event.target;
                  void handleUploadImages(files);
                  event.currentTarget.value = '';
                }}
                className="songlist-name-input"
              />
              <p className="songlist-item-meta">
                Uploaded images are saved to this band's Press Kit image library and can be reused across kits.
              </p>
              {imageAssets.length > 0 && (
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="setlist-action-btn setlist-action-btn--secondary"
                    onClick={() => setSelectedImageIds(allImageIds)}
                    disabled={allImagesSelected}
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    className="setlist-action-btn setlist-action-btn--secondary"
                    onClick={() => setSelectedImageIds([])}
                    disabled={selectedImageIds.length === 0}
                  >
                    Clear all
                  </button>
                </div>
              )}
            </div>

            {loadingImageAssets ? <p className="bands-status">Loading image assets…</p> : null}
            {!loadingImageAssets && imageAssets.length === 0 ? <p className="bands-status">No image assets uploaded.</p> : null}
            {imageAssets.map((entry) => (
              <article key={entry.id} className="songlist-item" style={{ display: 'block' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flex: 1, minWidth: 0 }}>
                    <input
                      type="checkbox"
                      checked={selectedImageIds.includes(entry.id)}
                      onChange={(event) => {
                        setSelectedImageIds((current) => (
                          event.target.checked
                            ? [...current, entry.id]
                            : current.filter((id) => id !== entry.id)
                        ));
                      }}
                    />
                    <img
                      src={entry.url}
                      alt={entry.title}
                      style={{ width: '42px', height: '42px', objectFit: 'cover', borderRadius: '8px', flexShrink: 0 }}
                    />
                    <strong style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.title}</strong>
                  </label>
                  {canEdit && (
                    <button
                      type="button"
                      className="setlist-action-btn setlist-action-btn--danger"
                      onClick={() => void removeImageAsset(entry)}
                    >
                      Delete
                    </button>
                  )}
                </div>
                <p className="songlist-item-meta" style={{ marginTop: '0.4rem', wordBreak: 'break-word' }}>{entry.url}</p>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
