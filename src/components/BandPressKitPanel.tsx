import { useEffect, useMemo, useState } from 'react';
import { Download, ExternalLink, FileText, Images, Package } from 'lucide-react';
import { collection, deleteDoc, doc, getDocs, query, setDoc } from 'firebase/firestore';
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import toast from '../utils/anchoredToast';
import { showPromptToast } from '../utils/toastDialogs';
import { createPressKitShare } from '../lib/pressKitApi';
import { db, storage } from '../lib/firebase';
import { generatePressKitZip, type PressKitImageItem, type PressKitTextItem } from '../lib/pressKitZip';
import type { Stageplot, InputList } from '../types';

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

type TabId = 'texts' | 'images' | 'kits';

interface PressKit {
  id: string;
  name: string;
  textIds: string[];
  imageIds: string[];
  stageplotIds: string[];
  riderIds: string[];
  createdAt?: string;
}

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
  initialTab = 'texts',
  onTabChange,
}: Props) {
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);
  const [texts, setTexts] = useState<Array<PressKitTextItem & { id: string }>>([]);
  const [imageAssets, setImageAssets] = useState<PressKitImageAsset[]>([]);
  const [selectedImageIds, setSelectedImageIds] = useState<string[]>([]);
  const [loadingTexts, setLoadingTexts] = useState(false);
  const [activeTextId, setActiveTextId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [editingBody, setEditingBody] = useState('');
  const [busySaveText, setBusySaveText] = useState(false);
  const [kits, setKits] = useState<PressKit[]>([]);
  const [loadingKits, setLoadingKits] = useState(false);
  const [activeKitId, setActiveKitId] = useState<string | null>(null);
  const [busyShareKit, setBusyShareKit] = useState(false);
  const [busyDownload, setBusyDownload] = useState(false);
  const [busyShare, setBusyShare] = useState(false);
  const [busyImageUpload, setBusyImageUpload] = useState(false);
  const [loadingImageAssets, setLoadingImageAssets] = useState(false);
  const [imageDropActive, setImageDropActive] = useState(false);

  const selectedImages = useMemo(
    () => imageAssets.filter((entry) => selectedImageIds.includes(entry.id)),
    [imageAssets, selectedImageIds]
  );
  const allImageIds = useMemo(() => imageAssets.map((entry) => entry.id), [imageAssets]);
  const allImagesSelected = imageAssets.length > 0 && selectedImageIds.length === imageAssets.length;

  const activeText = useMemo(
    () => texts.find((t) => t.id === activeTextId) ?? null,
    [activeTextId, texts],
  );

  const activeKit = useMemo(
    () => kits.find((k) => k.id === activeKitId) ?? null,
    [activeKitId, kits],
  );

  useEffect(() => {
    setActiveTab((current) => (current === initialTab ? current : initialTab));
  }, [initialTab]);

  // removed: stageplot/rider effects (now handled by BandTechRiderPanel)

  useEffect(() => {
    if (!db) return;
    let mounted = true;
    setLoadingTexts(true);
    void getDocs(query(collection(db, 'bands', bandId, 'pressKitTexts')))
      .then((snapshot) => {
        if (!mounted) return;
        const loaded = snapshot.docs.map((entry) => {
          const data = entry.data() as Record<string, unknown>;
          return {
            id: entry.id,
            title: typeof data.title === 'string' ? data.title : 'Untitled',
            body: typeof data.body === 'string' ? data.body : '',
          };
        });
        setTexts(loaded);
      })
      .catch((error) => {
        if (!mounted) return;
        const msg = error?.code === 'permission-denied'
          ? 'You do not have permission to view press kit texts.'
          : 'Failed to load press kit texts.';
        toast.error(msg);
      })
      .finally(() => {
        if (!mounted) return;
        setLoadingTexts(false);
      });
    return () => { mounted = false; };
  }, [bandId]);

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
    texts.length > 0
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
        stageplots: [],
        riders: [],
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
        selectedStageplotIds: [],
        selectedRiderIds: [],
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

  const handleCreateText = async () => {
    if (!canEdit) { toast.error('Only band editors can create text entries.'); return; }
    const value = await showPromptToast('New text title', {
      placeholder: 'Short Bio, Press Release...',
      confirmLabel: 'Create',
      cancelLabel: 'Cancel',
    });
    const title = value?.trim() ?? '';
    if (!title) return;
    if (!db) return;
    const textId = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    await setDoc(doc(db, 'bands', bandId, 'pressKitTexts', textId), {
      title,
      body: '',
      createdAt,
      createdBy: userId ?? null,
    });
    const newText = { id: textId, title, body: '' };
    setTexts((current) => [...current, newText]);
    setActiveTextId(textId);
    setEditingTitle(title);
    setEditingBody('');
  };

  const handleSaveText = async () => {
    if (!activeTextId || !db) return;
    setBusySaveText(true);
    try {
      const title = editingTitle.trim() || 'Untitled';
      const body = editingBody;
      await setDoc(doc(db, 'bands', bandId, 'pressKitTexts', activeTextId), { title, body }, { merge: true });
      setTexts((current) => current.map((t) => t.id === activeTextId ? { ...t, title, body } : t));
      toast.success('Text saved.');
    } catch {
      toast.error('Failed to save text.');
    } finally {
      setBusySaveText(false);
    }
  };

  const handleDeleteText = async (textId: string) => {
    if (!canEdit || !db) return;
    await deleteDoc(doc(db, 'bands', bandId, 'pressKitTexts', textId));
    setTexts((current) => current.filter((t) => t.id !== textId));
    if (activeTextId === textId) setActiveTextId(null);
  };

  // ── Kits ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!db) return;
    let mounted = true;
    setLoadingKits(true);
    void getDocs(query(collection(db, 'bands', bandId, 'pressKits')))
      .then((snapshot) => {
        if (!mounted) return;
        const loaded = snapshot.docs.map((entry) => {
          const data = entry.data() as Record<string, unknown>;
          const arr = (key: string) => Array.isArray(data[key]) ? (data[key] as string[]) : [];
          return {
            id: entry.id,
            name: typeof data.name === 'string' ? data.name : 'Unnamed Kit',
            textIds: arr('textIds'),
            imageIds: arr('imageIds'),
            stageplotIds: arr('stageplotIds'),
            riderIds: arr('riderIds'),
            createdAt: typeof data.createdAt === 'string' ? data.createdAt : undefined,
          } as PressKit;
        });
        setKits(loaded);
      })
      .catch((error) => {
        if (!mounted) return;
        const msg = error?.code === 'permission-denied'
          ? 'You do not have permission to view kits.'
          : 'Failed to load press kits.';
        toast.error(msg);
      })
      .finally(() => {
        if (!mounted) return;
        setLoadingKits(false);
      });
    return () => { mounted = false; };
  }, [bandId]);

  const handleCreateKit = async () => {
    if (!canEdit) { toast.error('Only band editors can create kits.'); return; }
    const value = await showPromptToast('New kit name', {
      placeholder: 'Festival 2026, Radio Interview...',
      confirmLabel: 'Create',
      cancelLabel: 'Cancel',
    });
    const name = value?.trim() ?? '';
    if (!name || !db) return;
    const kitId = crypto.randomUUID();
    const newKit: PressKit = { id: kitId, name, textIds: [], imageIds: [], stageplotIds: [], riderIds: [], createdAt: new Date().toISOString() };
    await setDoc(doc(db, 'bands', bandId, 'pressKits', kitId), {
      name,
      textIds: [],
      imageIds: [],
      stageplotIds: [],
      riderIds: [],
      createdAt: newKit.createdAt,
      createdBy: userId ?? null,
    });
    setKits((current) => [...current, newKit]);
    setActiveKitId(kitId);
  };

  const handleToggleKitItem = async (
    kitId: string,
    field: 'textIds' | 'imageIds' | 'stageplotIds' | 'riderIds',
    itemId: string,
    checked: boolean,
  ) => {
    if (!db) return;
    setKits((current) => current.map((k) => {
      if (k.id !== kitId) return k;
      const next = checked ? [...k[field], itemId] : k[field].filter((id) => id !== itemId);
      return { ...k, [field]: next };
    }));
    const kit = kits.find((k) => k.id === kitId);
    if (!kit) return;
    const updatedField = checked
      ? [...kit[field], itemId]
      : kit[field].filter((id) => id !== itemId);
    await setDoc(doc(db, 'bands', bandId, 'pressKits', kitId), { [field]: updatedField }, { merge: true });
  };

  const handleShareKit = async (kit: PressKit) => {
    if (!userId || !userEmail) { toast.error('You must be signed in to share.'); return; }
    setBusyShareKit(true);
    try {
      const kitTexts = texts.filter((t) => kit.textIds.includes(t.id)).map(({ title, body }) => ({ title, body }));
      const kitImages = imageAssets.filter((img) => kit.imageIds.includes(img.id)).map(({ title, url }) => ({ title, url }));
      const result = await createPressKitShare({
        userId,
        userEmail,
        bandId,
        selectedStageplotIds: kit.stageplotIds,
        selectedRiderIds: kit.riderIds,
        texts: kitTexts,
        images: kitImages,
      });
      await navigator.clipboard.writeText(result.publicUrl);
      toast.success('Public kit link copied to clipboard.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create share link.';
      toast.error(message);
    } finally {
      setBusyShareKit(false);
    }
  };

  const handleDownloadKit = async (kit: PressKit) => {
    setBusyDownload(true);
    try {
      const kitTexts = texts.filter((t) => kit.textIds.includes(t.id)).map(({ title, body }) => ({ title, body }));
      const kitImages = imageAssets.filter((img) => kit.imageIds.includes(img.id));
      const blob = await generatePressKitZip({
        bandName,
        stageplots: [],
        riders: [],
        texts: kitTexts,
        images: kitImages,
        generatedAt: new Date().toISOString(),
      });
      const blobUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = blobUrl;
      anchor.download = `${slugifyFileName(kit.name)}-press-kit.zip`;
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

  const handleDeleteKit = async (kitId: string) => {
    if (!canEdit || !db) return;
    await deleteDoc(doc(db, 'bands', bandId, 'pressKits', kitId));
    setKits((current) => current.filter((k) => k.id !== kitId));
    if (activeKitId === kitId) setActiveKitId(null);
  };

  return (
    <section className="bands-page bands-page--library">
      <div className="setlist-shell">
        <div className="bands-header setlist-header">
          <div className="setlist-title-block">
            <h1 className="song-list-heading setlist-title">Press Kit</h1>
            <p className="setlist-subtitle">Select assets and generate a downloadable promo package.</p>
          </div>
          <div className="setlist-header-actions">
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
        </div>

        <div className="setlist-tabs" style={{ marginBottom: '0.8rem' }}>
          {([
            { id: 'texts', label: 'Texts', icon: <FileText size={14} /> },
            { id: 'images', label: 'Images', icon: <Images size={14} /> },
            { id: 'kits', label: 'Kits', icon: <Package size={14} /> },
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

        {activeTab === 'texts' && (
          <div className="songlist-body" style={{ display: 'grid', gap: '0.8rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <p className="songlist-item-meta" style={{ margin: 0 }}>
                Add and manage press kit texts for your band.
              </p>
              <button
                type="button"
                className="setlist-action-btn setlist-action-btn--secondary"
                onClick={() => void handleCreateText()}
                disabled={!canEdit}
              >
                Create text
              </button>
            </div>
            {loadingTexts ? <p className="bands-status">Loading texts…</p> : null}
            {!loadingTexts && texts.length === 0 ? <p className="bands-status">No text entries yet.</p> : null}
            {texts.map((entry) => (
              <div key={entry.id} className="songlist-item" style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', justifyContent: 'space-between' }}>
                <span className="songlist-item-title" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>
                  {entry.title}
                </span>
                <span className="songlist-item-meta">{entry.body ? `${entry.body.length} chars` : 'empty'}</span>
                <button
                  type="button"
                  className={`setlist-action-btn setlist-action-btn--secondary${activeTextId === entry.id ? ' setlist-action-btn--active' : ''}`}
                  onClick={() => {
                    setActiveTextId(entry.id);
                    setEditingTitle(entry.title);
                    setEditingBody(entry.body);
                  }}
                >
                  Edit
                </button>
              </div>
            ))}
            {activeText ? (
              <div className="setlist-notes-editor">
                <input
                  type="text"
                  value={editingTitle}
                  onChange={(event) => setEditingTitle(event.target.value)}
                  placeholder="Text title"
                  className="songlist-name-input"
                  disabled={!canEdit}
                />
                <textarea
                  value={editingBody}
                  onChange={(event) => setEditingBody(event.target.value)}
                  placeholder="Write your text content here"
                  rows={6}
                  className="setlist-song-note-input"
                  disabled={!canEdit}
                />
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {canEdit && (
                    <button
                      type="button"
                      className="setlist-action-btn setlist-action-btn--secondary"
                      onClick={() => void handleSaveText()}
                      disabled={busySaveText}
                    >
                      Save
                    </button>
                  )}
                  {canEdit && (
                    <button
                      type="button"
                      className="setlist-action-btn setlist-action-btn--danger"
                      onClick={() => void handleDeleteText(activeText.id)}
                    >
                      Delete
                    </button>
                  )}
                  <button
                    type="button"
                    className="setlist-action-btn setlist-action-btn--secondary"
                    onClick={() => setActiveTextId(null)}
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : null}
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

        {activeTab === 'kits' && (
          <div className="songlist-body" style={{ display: 'grid', gap: '0.8rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <p className="songlist-item-meta" style={{ margin: 0 }}>
                Assemble named kits to share with venues and promoters.
              </p>
              <button
                type="button"
                className="setlist-action-btn setlist-action-btn--secondary"
                onClick={() => void handleCreateKit()}
                disabled={!canEdit}
              >
                Create kit
              </button>
            </div>

            {loadingKits ? <p className="bands-status">Loading kits…</p> : null}
            {!loadingKits && kits.length === 0 ? <p className="bands-status">No kits yet. Create one to start assembling a shareable package.</p> : null}

            {kits.map((kit) => (
              <div key={kit.id} className="songlist-item" style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', justifyContent: 'space-between' }}>
                <span className="songlist-item-title" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>
                  {kit.name}
                </span>
                <span className="songlist-item-meta">
                  {[
                    kit.textIds.length ? `${kit.textIds.length} text${kit.textIds.length === 1 ? '' : 's'}` : null,
                    kit.imageIds.length ? `${kit.imageIds.length} img${kit.imageIds.length === 1 ? '' : 's'}` : null,
                    kit.stageplotIds.length ? `${kit.stageplotIds.length} plot${kit.stageplotIds.length === 1 ? '' : 's'}` : null,
                    kit.riderIds.length ? `${kit.riderIds.length} rider${kit.riderIds.length === 1 ? '' : 's'}` : null,
                  ].filter(Boolean).join(' · ') || 'empty'}
                </span>
                <button
                  type="button"
                  className={`setlist-action-btn setlist-action-btn--secondary${activeKitId === kit.id ? ' setlist-action-btn--active' : ''}`}
                  onClick={() => setActiveKitId(activeKitId === kit.id ? null : kit.id)}
                >
                  {activeKitId === kit.id ? 'Close' : 'Edit'}
                </button>
              </div>
            ))}

            {activeKit ? (
              <div className="setlist-notes-editor" style={{ display: 'grid', gap: '0.75rem' }}>
                <p className="songlist-item-meta" style={{ margin: 0, fontWeight: 600 }}>{activeKit.name}</p>

                {texts.length > 0 && (
                  <div>
                    <p className="songlist-item-meta" style={{ marginBottom: '0.4rem' }}>Texts</p>
                    {texts.map((t) => (
                      <label key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.3rem 0' }}>
                        <input
                          type="checkbox"
                          checked={activeKit.textIds.includes(t.id)}
                          disabled={!canEdit}
                          onChange={(e) => void handleToggleKitItem(activeKit.id, 'textIds', t.id, e.target.checked)}
                        />
                        <span>{t.title}</span>
                      </label>
                    ))}
                  </div>
                )}

                {imageAssets.length > 0 && (
                  <div>
                    <p className="songlist-item-meta" style={{ marginBottom: '0.4rem' }}>Images</p>
                    {imageAssets.map((img) => (
                      <label key={img.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.3rem 0' }}>
                        <input
                          type="checkbox"
                          checked={activeKit.imageIds.includes(img.id)}
                          disabled={!canEdit}
                          onChange={(e) => void handleToggleKitItem(activeKit.id, 'imageIds', img.id, e.target.checked)}
                        />
                        <img src={img.url} alt={img.title} style={{ width: '28px', height: '28px', objectFit: 'cover', borderRadius: '4px' }} />
                        <span>{img.title}</span>
                      </label>
                    ))}
                  </div>
                )}

                {stageplots.length > 0 && (
                  <div>
                    <p className="songlist-item-meta" style={{ marginBottom: '0.4rem' }}>Stageplots</p>
                    {stageplots.map((sp) => (
                      <label key={sp.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.3rem 0' }}>
                        <input
                          type="checkbox"
                          checked={activeKit.stageplotIds.includes(sp.id)}
                          disabled={!canEdit}
                          onChange={(e) => void handleToggleKitItem(activeKit.id, 'stageplotIds', sp.id, e.target.checked)}
                        />
                        <span>{sp.name}</span>
                      </label>
                    ))}
                  </div>
                )}

                {riders.length > 0 && (
                  <div>
                    <p className="songlist-item-meta" style={{ marginBottom: '0.4rem' }}>Input Lists</p>
                    {riders.map((rider) => (
                      <label key={rider.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.3rem 0' }}>
                        <input
                          type="checkbox"
                          checked={activeKit.riderIds.includes(rider.id)}
                          disabled={!canEdit}
                          onChange={(e) => void handleToggleKitItem(activeKit.id, 'riderIds', rider.id, e.target.checked)}
                        />
                        <span>{rider.name}</span>
                      </label>
                    ))}
                  </div>
                )}

                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', paddingTop: '0.25rem' }}>
                  <button
                    type="button"
                    className="setlist-action-btn setlist-action-btn--secondary"
                    onClick={() => void handleShareKit(activeKit)}
                    disabled={busyShareKit}
                  >
                    <ExternalLink size={13} />
                    Copy share link
                  </button>
                  <button
                    type="button"
                    className="setlist-action-btn setlist-action-btn--secondary"
                    onClick={() => void handleDownloadKit(activeKit)}
                    disabled={busyDownload}
                  >
                    <Download size={13} />
                    Download ZIP
                  </button>
                  {canEdit && (
                    <button
                      type="button"
                      className="setlist-action-btn setlist-action-btn--danger"
                      onClick={() => void handleDeleteKit(activeKit.id)}
                    >
                      Delete kit
                    </button>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}
