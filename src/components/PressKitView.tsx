import { useEffect, useRef, useState } from 'react';
import { useEditor, useEditorState, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Bold, Italic, List, ListOrdered, Heading2, Heading3, Minus, Undo, Redo, Link2, Link2Off, Download, Trash2, PenLine, Newspaper, X, ArrowDownToLine } from 'lucide-react';
import { collection, deleteDoc, doc, getDocs, query, setDoc } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import toast from '../utils/anchoredToast';
import { showConfirmToast } from '../utils/toastDialogs';
import { db, storage } from '../lib/firebase';
import { createPressKitShare, disablePressKitShare, getActivePressKitShare } from '../lib/pressKitApi';
import type { ActivePressKitShare } from '../lib/pressKitApi';
import { generatePressKitZip } from '../lib/pressKitZip';
import { PRESSKIT_ICON_OPTIONS } from '../lib/iconOptions';
import { createTrashPayload, createTrashTimestamps, TRASH_COLLECTION } from '../lib/trash';
import { createWebpThumbnail } from '../utils/imageThumbnail';
import type { PressKit } from '../types';
import { useBands } from '../context/BandsContext';
import { useAuth } from '../context/AuthContext';
import { bandCanUse } from '../lib/planLimits';
import { parsePressKitMedia } from '../utils/pressKitMedia';

interface PressKitImageAsset {
  id: string;
  title: string;
  url: string;
  thumbUrl?: string;
  storagePath?: string;
  thumbStoragePath?: string;
  mimeType?: string;
  sizeBytes?: number;
  thumbSizeBytes?: number;
  createdAt?: string;
}

const MEDIA_ITEMS_PER_PAGE = 16;

function slugifyFileName(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'press-kit';
}

function sanitizePathSegment(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'image';
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

interface Props {
  bandId: string;
  bandName: string;
  kit: PressKit;
  canEdit: boolean;
  userId: string | null;
  userEmail: string | null;
  onDelete: () => void;
  onRename?: (name: string) => Promise<void> | void;
  onUpdateIcon?: (icon?: string) => Promise<void> | void;
}

function normalizeEmojiIcon(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return [...trimmed].slice(0, 2).join('');
}

export default function PressKitView({ bandId, bandName, kit, canEdit, userId, userEmail, onDelete, onRename, onUpdateIcon }: Props) {
  const { bands, deleteBandPressKit, refreshBandPressKits, refreshBandTrash, updateBandLogo } = useBands();
  const { user } = useAuth();

  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(kit.name);
  const [showIconEditor, setShowIconEditor] = useState(false);
  const [iconDraft, setIconDraft] = useState(kit.icon ?? '');
  const iconPickerRef = useRef<HTMLDivElement | null>(null);
  const iconTriggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => { if (!isRenaming) setRenameValue(kit.name); }, [isRenaming, kit.name]);
  useEffect(() => { setIconDraft(kit.icon ?? ''); }, [kit.icon]);

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

  const handleRenameCommit = async () => {
    const trimmed = renameValue.trim();
    if (!trimmed) { setRenameValue(kit.name); setIsRenaming(false); return; }
    if (trimmed !== kit.name && onRename) await onRename(trimmed);
    setIsRenaming(false);
  };

  // ── Rich text ────────────────────────────────────────────────────────────
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const editor = useEditor({
    extensions: [StarterKit],
    content: kit.richText || '',
    editable: canEdit,
    onUpdate: ({ editor: ed }) => {
      if (!canEdit) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        void saveRichText(ed.getHTML());
      }, 1200);
    },
  });

  const toolbarState = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => {
      if (!currentEditor) {
        return { isBold: false, isItalic: false, isHeading2: false, isHeading3: false, isBulletList: false, isOrderedList: false, canUndo: false, canRedo: false };
      }
      return {
        isBold: currentEditor.isActive('bold'),
        isItalic: currentEditor.isActive('italic'),
        isHeading2: currentEditor.isActive('heading', { level: 2 }),
        isHeading3: currentEditor.isActive('heading', { level: 3 }),
        isBulletList: currentEditor.isActive('bulletList'),
        isOrderedList: currentEditor.isActive('orderedList'),
        canUndo: currentEditor.can().undo(),
        canRedo: currentEditor.can().redo(),
      };
    },
  });

  // Sync content when kit changes (e.g. navigating between kits)
  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    if (current !== kit.richText) {
      editor.commands.setContent(kit.richText || '', { emitUpdate: false });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kit.id]);

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(canEdit);
  }, [canEdit, editor]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  const saveRichText = async (html: string) => {
    if (!db) return;
    try {
      await setDoc(doc(db, 'bands', bandId, 'pressKits', kit.id), { richText: html }, { merge: true });
    } catch {
      toast.error('Failed to save text.');
    }
  };

  // ── Images ───────────────────────────────────────────────────────────────
  const [imageAssets, setImageAssets] = useState<PressKitImageAsset[]>([]);
  const [loadingImages, setLoadingImages] = useState(false);
  const [busyUpload, setBusyUpload] = useState(false);
  const [dropActive, setDropActive] = useState(false);
  const [kitImageIds, setKitImageIds] = useState<string[]>(kit.imageIds ?? []);
  const [imagePage, setImagePage] = useState(1);
  const [imagePreview, setImagePreview] = useState<{ url: string; title: string } | null>(null);
  const [downloadingImageId, setDownloadingImageId] = useState<string | null>(null);

  // Sync kitImageIds when kit prop changes
  useEffect(() => {
    setKitImageIds(kit.imageIds ?? []);
    setImagePage(1);
  }, [kit.id, kit.imageIds]);

  useEffect(() => {
    if (!db) return;
    let mounted = true;
    setLoadingImages(true);
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
            thumbUrl: typeof data.thumbUrl === 'string' ? data.thumbUrl : undefined,
            thumbStoragePath: typeof data.thumbStoragePath === 'string' ? data.thumbStoragePath : undefined,
            mimeType: typeof data.mimeType === 'string' ? data.mimeType : undefined,
            sizeBytes: typeof data.sizeBytes === 'number' ? data.sizeBytes : undefined,
            thumbSizeBytes: typeof data.thumbSizeBytes === 'number' ? data.thumbSizeBytes : undefined,
            createdAt: typeof data.createdAt === 'string' ? data.createdAt : undefined,
          } as PressKitImageAsset;
        }).filter((a) => a.url.length > 0).sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
        setImageAssets(assets);
      })
      .catch(() => toast.error('Failed to load images.'))
      .finally(() => { if (mounted) setLoadingImages(false); });
    return () => { mounted = false; };
  }, [bandId]);

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(imageAssets.length / MEDIA_ITEMS_PER_PAGE));
    if (imagePage > totalPages) {
      setImagePage(totalPages);
    }
  }, [imageAssets.length, imagePage]);

  useEffect(() => {
    if (!imagePreview) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setImagePreview(null);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [imagePreview]);

  const uploadImages = async (files: FileList | null) => {
    if (!files || files.length === 0 || !canEdit || !storage) return;
    const accepted = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (accepted.length === 0) { toast.error('Choose at least one image file.'); return; }
    setBusyUpload(true);
    try {
      const uploaded = await Promise.all(accepted.map(async (file) => {
        const ext = file.name.includes('.') ? file.name.split('.').pop()?.toLowerCase() ?? 'bin' : 'bin';
        const imageId = crypto.randomUUID();
        const storagePath = `bands/${bandId}/presskit/images/${imageId}-${sanitizePathSegment(file.name)}.${ext}`;
        const thumbStoragePath = `bands/${bandId}/presskit/images/${imageId}-thumb.webp`;
        const storageRef = ref(storage!, storagePath);
        await uploadBytes(storageRef, file, {
          contentType: file.type || undefined,
          cacheControl: 'public,max-age=31536000,immutable',
        });
        const url = await getDownloadURL(storageRef);
        const thumbBlob = await createWebpThumbnail(file);
        let thumbUrl: string | undefined;
        let thumbSizeBytes: number | undefined;

        if (thumbBlob) {
          const thumbRef = ref(storage!, thumbStoragePath);
          await uploadBytes(thumbRef, thumbBlob, {
            contentType: 'image/webp',
            cacheControl: 'public,max-age=31536000,immutable',
          });
          thumbUrl = await getDownloadURL(thumbRef);
          thumbSizeBytes = thumbBlob.size;
        }

        const title = file.name.replace(/\.[^.]+$/, '').trim() || 'Image';
        const createdAt = new Date().toISOString();
        if (db) {
          await setDoc(doc(db, 'bands', bandId, 'pressKitImages', imageId), {
            title,
            url,
            thumbUrl: thumbUrl ?? null,
            storagePath,
            thumbStoragePath: thumbUrl ? thumbStoragePath : null,
            mimeType: file.type || null,
            sizeBytes: file.size,
            thumbSizeBytes: thumbSizeBytes ?? null,
            createdAt,
            createdBy: userId ?? null,
          });
        }
        return {
          id: imageId,
          title,
          url,
          thumbUrl,
          storagePath,
          thumbStoragePath: thumbUrl ? thumbStoragePath : undefined,
          mimeType: file.type || undefined,
          sizeBytes: file.size,
          thumbSizeBytes,
          createdAt,
        } as PressKitImageAsset;
      }));
      setImageAssets((current) => [...uploaded, ...current.filter((a) => !uploaded.some((u) => u.id === a.id))]);
      // Auto-attach uploaded images to this kit
      const newIds = uploaded.map((u) => u.id);
      const nextIds = [...new Set([...kitImageIds, ...newIds])];
      setKitImageIds(nextIds);
      if (db) await setDoc(doc(db, 'bands', bandId, 'pressKits', kit.id), { imageIds: nextIds }, { merge: true });
      toast.success(`Uploaded ${uploaded.length} image${uploaded.length === 1 ? '' : 's'}.`);
    } catch {
      toast.error('Failed to upload images.');
    } finally {
      setBusyUpload(false);
    }
  };

  const toggleKitImage = async (imageId: string, attached: boolean) => {
    const next = attached ? [...kitImageIds, imageId] : kitImageIds.filter((id) => id !== imageId);
    setKitImageIds(next);
    if (db) await setDoc(doc(db, 'bands', bandId, 'pressKits', kit.id), { imageIds: next }, { merge: true });
  };

  const toggleAllImages = async (attachAll: boolean) => {
    const next = attachAll ? imageAssets.map((a) => a.id) : [];
    setKitImageIds(next);
    if (db) await setDoc(doc(db, 'bands', bandId, 'pressKits', kit.id), { imageIds: next }, { merge: true });
  };

  const removeImageAsset = async (asset: PressKitImageAsset) => {
    if (!canEdit) return;
    if (asset.id === 'band-logo') {
      const confirmed = await showConfirmToast(`Move logo "${asset.title}" to trash?`, {
        confirmLabel: 'Move to trash',
      });
      if (!confirmed) return;

      const error = await updateBandLogo(bandId, null);
      if (error) {
        toast.error(error);
        return;
      }

      setImageAssets((current) => current.filter((entry) => entry.id !== asset.id));
      setKitImageIds((current) => current.filter((entryId) => entryId !== asset.id));
      void refreshBandPressKits(bandId);
      void refreshBandTrash(bandId);
      toast.success('Logo moved to trash.');
      return;
    }

    const confirmed = await showConfirmToast(`Move image "${asset.title}" to trash? It will be permanently deleted after 30 days.`, {
      confirmLabel: 'Move to trash',
    });
    if (!confirmed) return;

    if (!db) {
      toast.error('Band libraries require cloud sync.');
      return;
    }
    const firestore = db;

    try {
      const kitsSnapshot = await getDocs(query(collection(firestore, 'bands', bandId, 'pressKits')));
      const linkedPressKitIds = kitsSnapshot.docs
        .filter((entry) => {
          const data = entry.data() as Record<string, unknown>;
          return Array.isArray(data.imageIds) && data.imageIds.includes(asset.id);
        })
        .map((entry) => entry.id);

      const { deletedAt, purgeAt } = createTrashTimestamps();
      const trashId = crypto.randomUUID();
      const now = new Date().toISOString();

      await Promise.all([
        setDoc(
          doc(firestore, 'bands', bandId, TRASH_COLLECTION, trashId),
          createTrashPayload('pressKitImage', deletedAt, purgeAt, {
            image: {
              id: asset.id,
              title: asset.title,
              url: asset.url,
              thumbUrl: asset.thumbUrl,
              storagePath: asset.storagePath,
              thumbStoragePath: asset.thumbStoragePath,
              mimeType: asset.mimeType,
              sizeBytes: asset.sizeBytes,
              thumbSizeBytes: asset.thumbSizeBytes,
              createdAt: asset.createdAt,
              createdBy: userId ?? undefined,
            },
            linkedPressKitIds,
          })
        ),
        deleteDoc(doc(firestore, 'bands', bandId, 'pressKitImages', asset.id)),
        ...kitsSnapshot.docs
          .filter((entry) => linkedPressKitIds.includes(entry.id))
          .map((entry) => {
            const data = entry.data() as Record<string, unknown>;
            const imageIds = Array.isArray(data.imageIds)
              ? data.imageIds.filter((id): id is string => typeof id === 'string' && id !== asset.id)
              : [];
            return setDoc(
              doc(firestore, 'bands', bandId, 'pressKits', entry.id),
              { imageIds, updatedAt: now },
              { merge: true }
            );
          }),
      ]);

      setImageAssets((current) => current.filter((a) => a.id !== asset.id));
      setKitImageIds((current) => current.filter((id) => id !== asset.id));
      void refreshBandPressKits(bandId);
      void refreshBandTrash(bandId);
      toast.success('Image moved to trash.');
    } catch {
      toast.error('Failed to move image to trash.');
    }
  };

  const handleImageDownload = async (asset: PressKitImageAsset) => {
    setDownloadingImageId(asset.id);
    try {
      const response = await fetch(asset.url);
      if (!response.ok) throw new Error('Failed to download image.');
      const blob = await response.blob();
      const ext = inferImageExtension(asset.url, blob.type);
      triggerBlobDownload(blob, `${slugifyFileName(asset.title)}.${ext}`);
    } catch {
      toast.error('Failed to download image.');
    } finally {
      setDownloadingImageId(null);
    }
  };

  // ── Share / Download ──────────────────────────────────────────────────────
  const [busyShare, setBusyShare] = useState(false);
  const [activeShare, setActiveShare] = useState<ActivePressKitShare | null>(null);

  useEffect(() => {
    if (!userId || !userEmail) return;
    void getActivePressKitShare(userId, userEmail, bandId).then(setActiveShare);
  }, [bandId, userId, userEmail]);

  // ── Video URLs ───────────────────────────────────────────────────────────
  const [videoUrls, setVideoUrls] = useState<string[]>(kit.videoUrls ?? []);
  const [selectedVideoUrls, setSelectedVideoUrls] = useState<string[]>(
    kit.selectedVideoUrls ?? kit.videoUrls ?? [],
  );
  const [newVideoUrl, setNewVideoUrl] = useState('');

  useEffect(() => {
    const nextVideoUrls = kit.videoUrls ?? [];
    const nextSelected = kit.selectedVideoUrls ?? nextVideoUrls;
    setVideoUrls(nextVideoUrls);
    setSelectedVideoUrls(nextSelected.filter((url) => nextVideoUrls.includes(url)));
  }, [kit.id, kit.videoUrls, kit.selectedVideoUrls]);

  const saveVideoState = async (nextVideoUrls: string[], nextSelectedVideoUrls: string[]) => {
    if (!db || !canEdit) return;
    const cleanedUrls = nextVideoUrls.map((u) => u.trim()).filter(Boolean);
    const validUrls = cleanedUrls.filter((url) => parsePressKitMedia(url));
    const validSelected = nextSelectedVideoUrls
      .map((u) => u.trim())
      .filter((url) => validUrls.includes(url));

    if (validUrls.length !== cleanedUrls.length) {
      toast.error('Some links were ignored. Only YouTube, Vimeo, VEVO, and Spotify URLs are supported.');
    }

    try {
      await setDoc(
        doc(db, 'bands', bandId, 'pressKits', kit.id),
        {
          videoUrls: validUrls.length > 0 ? validUrls : null,
          selectedVideoUrls: validSelected.length > 0 ? validSelected : null,
        },
        { merge: true },
      );
      setVideoUrls(validUrls);
      setSelectedVideoUrls(validSelected);
    } catch {
      toast.error('Failed to save video links.');
    }
  };

  const addVideoUrl = async () => {
    if (!canEdit) return;
    const trimmed = newVideoUrl.trim();
    if (!trimmed) return;

    if (!parsePressKitMedia(trimmed)) {
      toast.error('Use a valid YouTube, Vimeo, VEVO, or Spotify link.');
      return;
    }

    if (videoUrls.includes(trimmed)) {
      toast.error('That video is already added.');
      return;
    }

    const nextUrls = [...videoUrls, trimmed];
    const nextSelected = [...selectedVideoUrls, trimmed];
    setNewVideoUrl('');
    await saveVideoState(nextUrls, nextSelected);
  };

  const removeVideoUrl = async (url: string) => {
    const nextUrls = videoUrls.filter((entry) => entry !== url);
    const nextSelected = selectedVideoUrls.filter((entry) => entry !== url);
    await saveVideoState(nextUrls, nextSelected);
  };

  const toggleVideoSelection = async (url: string, selected: boolean) => {
    const nextSelected = selected
      ? Array.from(new Set([...selectedVideoUrls, url]))
      : selectedVideoUrls.filter((entry) => entry !== url);
    await saveVideoState(videoUrls, nextSelected);
  };

  const toggleAllVideos = async (selectAll: boolean) => {
    await saveVideoState(videoUrls, selectAll ? [...videoUrls] : []);
  };
  const [busyDownload, setBusyDownload] = useState(false);

  const attachedImages = imageAssets.filter((img) => kitImageIds.includes(img.id));
  const imageTotalPages = Math.max(1, Math.ceil(imageAssets.length / MEDIA_ITEMS_PER_PAGE));
  const imagePageStart = (imagePage - 1) * MEDIA_ITEMS_PER_PAGE;
  const pagedImageAssets = imageAssets.slice(imagePageStart, imagePageStart + MEDIA_ITEMS_PER_PAGE);

  const handleShare = async () => {
    if (!userId || !userEmail) { toast.error('You must be signed in to share.'); return; }
    const band = bands.find((entry) => entry.id === bandId) ?? null;
    if (!bandCanUse(band, 'shareableLinks', user?.plan, user?.subscriptionStatus, user?.planOverride)) {
      toast.error('Shareable public links require a Pro or Crew plan for this band.');
      return;
    }
    setBusyShare(true);
    try {
      const result = await createPressKitShare({
        userId,
        userEmail,
        bandId,
        kitId: kit.id,
        selectedStageplotIds: [],
        selectedRiderIds: [],
      });
      setActiveShare({ token: result.token, publicUrl: result.publicUrl, createdAt: new Date().toISOString() });
      await navigator.clipboard.writeText(result.publicUrl);
      toast.success('Public link copied to clipboard.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create share link.');
    } finally {
      setBusyShare(false);
    }
  };

  const [busyDisable, setBusyDisable] = useState(false);

  const handleDisable = async () => {
    if (!userId || !userEmail || !activeShare) return;
    const confirmed = await showConfirmToast('Disable this public link? Anyone with it will lose access.', {
      confirmLabel: 'Disable link',
    });
    if (!confirmed) return;
    setBusyDisable(true);
    try {
      await disablePressKitShare(userId, userEmail, bandId, activeShare.token);
      setActiveShare(null);
      toast.success('Public link disabled.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to disable link.');
    } finally {
      setBusyDisable(false);
    }
  };

  const handleDownload = async () => {
    setBusyDownload(true);
    try {
      const richText = editor?.getHTML() ?? kit.richText ?? '';
      const blob = await generatePressKitZip({
        bandName,
        stageplots: [],
        riders: [],
        texts: richText ? [{ title: kit.name, body: richText }] : [],
        images: attachedImages,
        generatedAt: new Date().toISOString(),
      });
      const blobUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = blobUrl;
      anchor.download = `${slugifyFileName(kit.name)}-press-kit.zip`;
      anchor.click();
      URL.revokeObjectURL(blobUrl);
    } catch {
      toast.error('Failed to generate ZIP.');
    } finally {
      setBusyDownload(false);
    }
  };

  const handleDelete = async () => {
    if (!canEdit) return;
    const confirmed = await showConfirmToast(`Delete "${kit.name}"? This cannot be undone.`, {
      confirmLabel: 'Delete press kit',
    });
    if (!confirmed) return;
    const error = await deleteBandPressKit(bandId, kit.id);
    if (error) { toast.error(error); return; }
    onDelete();
  };

  return (
    <section className="bands-page bands-page--library">
      <div className="setlist-shell">
        <div className="list-sticky-header">
          <header className="page-section-header bands-header resource-header">
            <div className="setlist-title-block">
              {isRenaming ? (
                <input
                  type="text"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleRenameCommit();
                    if (e.key === 'Escape') { setRenameValue(kit.name); setIsRenaming(false); }
                  }}
                  onBlur={() => void handleRenameCommit()}
                  className="setlist-name-input"
                  autoFocus
                />
              ) : (
                <div className="song-list-title-row">
                  <h1 className="resource-title setlist-title resource-title--setlist">
                    {canEdit && onUpdateIcon ? (
                      <div className="icon-picker-wrapper" ref={iconPickerRef}>
                        <button
                          ref={iconTriggerRef}
                          type="button"
                          className={`icon-picker-trigger${showIconEditor ? ' is-open' : ''}`}
                          aria-haspopup="dialog"
                          aria-expanded={showIconEditor}
                          onClick={(e) => { e.stopPropagation(); setShowIconEditor((v) => !v); }}
                          title="Change press kit icon"
                          aria-label="Change press kit icon"
                        >
                          <span className="resource-title-icon" aria-hidden="true">
                            {kit.icon ? kit.icon : <Newspaper size={20} />}
                          </span>
                        </button>
                        {showIconEditor && (
                          <div className="icon-picker-popover" role="dialog" aria-label="Choose press kit icon">
                            <div className="emoji-choice-grid" role="radiogroup" aria-label="Press kit icon options">
                              <button
                                type="button"
                                className={`emoji-choice-btn${!kit.icon ? ' active' : ''}`}
                                onClick={() => { void onUpdateIcon(undefined); setIconDraft(''); setShowIconEditor(false); }}
                                aria-pressed={!kit.icon}
                              >
                                <Newspaper size={16} />
                              </button>
                              {PRESSKIT_ICON_OPTIONS.map((emoji) => {
                                const selected = iconDraft === emoji;
                                return (
                                  <button
                                    key={emoji}
                                    type="button"
                                    className={`emoji-choice-btn${selected ? ' active' : ''}`}
                                    onClick={() => { void onUpdateIcon(normalizeEmojiIcon(emoji)); setIconDraft(emoji); setShowIconEditor(false); }}
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
                              onClick={() => { void onUpdateIcon(undefined); setIconDraft(''); setShowIconEditor(false); }}
                            >
                              Reset to default
                            </button>
                          </div>
                        )}
                      </div>
                    ) : kit.icon ? (
                      <span className="resource-title-icon" aria-hidden="true">{kit.icon}</span>
                    ) : null}
                    {kit.name}
                  </h1>
                  {canEdit && onRename ? (
                    <button type="button" className="title-rename-btn" onClick={() => setIsRenaming(true)} title="Rename press kit">
                      <PenLine size={14} />
                    </button>
                  ) : null}
                </div>
              )}
              <p className="setlist-subtitle">Write copy, attach images, and share your public press kit.</p>
            </div>
            <div className="resource-header-actions">
              {activeShare ? (
                <>
                  <button
                    type="button"
                    className="setlist-action-btn setlist-action-btn--accent"
                    onClick={() => { void navigator.clipboard.writeText(activeShare.publicUrl).then(() => toast.success('Link copied.')); }}
                    title="Copy public link"
                  >
                    <Link2 size={14} /> Copy link
                  </button>
                  <button
                    type="button"
                    className="setlist-action-btn setlist-action-btn--secondary"
                    onClick={() => void handleDisable()}
                    disabled={busyDisable}
                    title="Disable public link"
                  >
                    <Link2Off size={14} /> {busyDisable ? 'Disabling...' : 'Disable link'}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="setlist-action-btn setlist-action-btn--accent"
                  onClick={() => void handleShare()}
                  disabled={busyShare}
                  title="Create and copy public share link"
                >
                  <Link2 size={14} /> {busyShare ? 'Creating...' : 'Share'}
                </button>
              )}
              <button
                type="button"
                className="setlist-action-btn setlist-action-btn--secondary"
                onClick={() => void handleDownload()}
                disabled={busyDownload}
                title="Download ZIP"
              >
                <Download size={14} />
              </button>
              {canEdit && (
                <button
                  type="button"
                  className="setlist-action-btn setlist-action-btn--secondary"
                  onClick={() => void handleDelete()}
                  title="Delete press kit"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          </header>


        </div>

        <div className="press-kit-body-columns">
          <div className="press-kit-section-card">
            <section className="press-kit-text-section">
              <header className="press-kit-section-header">
                <p className="press-kit-section-title">Text</p>
                {canEdit && <p className="press-kit-section-hint">Write and format the copy to include in this press kit.</p>}
              </header>
              {canEdit && editor && (
                <div className="press-kit-toolbar" aria-label="Text formatting toolbar">
                  <button type="button" title="Bold" className={`press-kit-toolbar-btn${toolbarState.isBold ? ' active' : ''}`} onClick={() => editor.chain().focus().toggleBold().run()}><Bold size={14} /></button>
                  <button type="button" title="Italic" className={`press-kit-toolbar-btn${toolbarState.isItalic ? ' active' : ''}`} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic size={14} /></button>
                  <span className="press-kit-toolbar-sep" />
                  <button type="button" title="Heading 2" className={`press-kit-toolbar-btn${toolbarState.isHeading2 ? ' active' : ''}`} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 size={14} /></button>
                  <button type="button" title="Heading 3" className={`press-kit-toolbar-btn${toolbarState.isHeading3 ? ' active' : ''}`} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}><Heading3 size={14} /></button>
                  <span className="press-kit-toolbar-sep" />
                  <button type="button" title="Bullet list" className={`press-kit-toolbar-btn${toolbarState.isBulletList ? ' active' : ''}`} onClick={() => editor.chain().focus().toggleBulletList().run()}><List size={14} /></button>
                  <button type="button" title="Ordered list" className={`press-kit-toolbar-btn${toolbarState.isOrderedList ? ' active' : ''}`} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered size={14} /></button>
                  <span className="press-kit-toolbar-sep" />
                  <button type="button" title="Horizontal rule" className="press-kit-toolbar-btn" onClick={() => editor.chain().focus().setHorizontalRule().run()}><Minus size={14} /></button>
                  <span className="press-kit-toolbar-sep" />
                  <button type="button" title="Undo" className="press-kit-toolbar-btn" onClick={() => editor.chain().focus().undo().run()} disabled={!toolbarState.canUndo}><Undo size={14} /></button>
                  <button type="button" title="Redo" className="press-kit-toolbar-btn" onClick={() => editor.chain().focus().redo().run()} disabled={!toolbarState.canRedo}><Redo size={14} /></button>
                </div>
              )}
              <div className="press-kit-editor-wrap">
                <EditorContent editor={editor} className="press-kit-editor" />
              </div>
            </section>
          </div>

          {/* ── Images + Videos ─────────────────────────────────────────── */}
          <div className="press-kit-column-stack">
          <div className="press-kit-section-card">
          <section className="press-kit-images-section">
            <header className="press-kit-section-header">
              <p className="press-kit-section-title">Images</p>
              {canEdit && <p className="press-kit-section-hint">Check the images to include in this press kit.</p>}
            </header>
            <div className="setlist-notes-editor">

              {canEdit && (
                <div
                  role="button"
                  tabIndex={0}
                  onDragOver={(e) => { e.preventDefault(); if (!busyUpload) setDropActive(true); }}
                  onDragLeave={() => setDropActive(false)}
                  onDrop={(e) => { e.preventDefault(); setDropActive(false); void uploadImages(e.dataTransfer.files); }}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') document.getElementById('pk-img-input')?.click(); }}
                  onClick={() => document.getElementById('pk-img-input')?.click()}
                  style={{
                    border: dropActive ? '2px solid var(--bands-hue)' : '2px dashed var(--bands-hue)',
                    borderRadius: '10px',
                    padding: '0.75rem',
                    background: dropActive ? 'var(--bands-hue-soft)' : 'color-mix(in srgb, var(--bands-hue) 8%, var(--surface))',
                    cursor: 'pointer',
                    marginBottom: '0.75rem',
                  }}
                >
                  <p className="songlist-item-meta" style={{ margin: 0 }}>
                    {busyUpload ? 'Uploading…' : 'Drag & drop or click to upload images'}
                  </p>
                </div>
              )}
              <input id="pk-img-input" type="file" accept="image/*" multiple style={{ display: 'none' }} disabled={!canEdit || busyUpload}
                onChange={(e) => { void uploadImages(e.target.files); e.currentTarget.value = ''; }}
              />

              {loadingImages && <p className="bands-status">Loading images…</p>}

              {!loadingImages && imageAssets.length === 0 && (
                <p className="bands-status">No images uploaded yet.</p>
              )}

              {canEdit && imageAssets.length > 0 && (
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem', fontSize: '0.8rem', color: 'var(--muted)', cursor: 'pointer', userSelect: 'none' }}>
                  <input
                    type="checkbox"
                    checked={imageAssets.length > 0 && imageAssets.every((a) => kitImageIds.includes(a.id))}
                    ref={(el) => { if (el) el.indeterminate = imageAssets.some((a) => kitImageIds.includes(a.id)) && !imageAssets.every((a) => kitImageIds.includes(a.id)); }}
                    onChange={(e) => void toggleAllImages(e.target.checked)}
                  />
                  Select all
                </label>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '0.6rem' }}>
              {pagedImageAssets.map((img) => {
                const attached = kitImageIds.includes(img.id);
                return (
                  <div key={img.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', background: 'var(--surface)', borderRadius: '8px', border: '1px solid var(--border)', overflow: 'hidden' }}>
                    <div style={{ position: 'relative' }}>
                      <button
                        type="button"
                        className="image-preview-trigger"
                        onClick={() => setImagePreview({ url: img.url, title: img.title })}
                        aria-label={`Preview ${img.title}`}
                      >
                        <img
                          src={img.thumbUrl ?? img.url}
                          alt={img.title}
                          loading="lazy"
                          decoding="async"
                          style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', display: 'block' }}
                        />
                      </button>
                      {canEdit && (
                        <label style={{ position: 'absolute', top: '6px', left: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '1.4rem', height: '1.4rem', background: 'rgba(0,0,0,0.5)', borderRadius: '4px', cursor: 'pointer', zIndex: 1 }}>
                          <input
                            type="checkbox"
                            checked={attached}
                            disabled={!canEdit}
                            onChange={(e) => void toggleKitImage(img.id, e.target.checked)}
                            style={{ accentColor: 'var(--bands-hue)' }}
                          />
                        </label>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '0 0.4rem 0.4rem' }}>
                      <button
                        type="button"
                        className="title-rename-btn"
                        title="Download image"
                        aria-label={`Download ${img.title}`}
                        onClick={() => { void handleImageDownload(img); }}
                        disabled={downloadingImageId === img.id}
                      >
                        <ArrowDownToLine size={13} />
                      </button>
                      {canEdit && (
                        <button type="button" className="title-rename-btn" title="Delete image" aria-label={`Delete ${img.title}`} onClick={() => void removeImageAsset(img)}><Trash2 size={13} /></button>
                      )}
                    </div>
                  </div>
                );
              })}
              </div>

              {imageAssets.length > MEDIA_ITEMS_PER_PAGE && (
                <div className="media-pagination">
                  <button
                    type="button"
                    className="setlist-action-btn setlist-action-btn--secondary"
                    onClick={() => setImagePage((current) => Math.max(1, current - 1))}
                    disabled={imagePage <= 1}
                  >
                    Previous
                  </button>
                  <p className="bands-inline-note">Page {imagePage} of {imageTotalPages}</p>
                  <button
                    type="button"
                    className="setlist-action-btn setlist-action-btn--secondary"
                    onClick={() => setImagePage((current) => Math.min(imageTotalPages, current + 1))}
                    disabled={imagePage >= imageTotalPages}
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          </section>
          </div>

          <div className="press-kit-section-card">
            <section className="press-kit-videos-section">
              <header className="press-kit-section-header">
                <p className="press-kit-section-title">Videos</p>
                {canEdit && <p className="press-kit-section-hint">Add videos and choose which ones are included in the public share link.</p>}
              </header>
              <div className="setlist-notes-editor">
                {canEdit && (
                  <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                    <input
                      type="url"
                      value={newVideoUrl}
                      onChange={(e) => setNewVideoUrl(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          void addVideoUrl();
                        }
                      }}
                      placeholder="YouTube, Vimeo or Vevo"
                      className="press-kit-video-url-input"
                    />
                    <button
                      type="button"
                      className="setlist-action-btn setlist-action-btn--secondary"
                      onClick={() => void addVideoUrl()}
                    >
                      Add
                    </button>
                  </div>
                )}

                {canEdit && videoUrls.length > 0 && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem', fontSize: '0.8rem', color: 'var(--muted)', cursor: 'pointer', userSelect: 'none' }}>
                    <input
                      type="checkbox"
                      checked={videoUrls.length > 0 && videoUrls.every((url) => selectedVideoUrls.includes(url))}
                      ref={(el) => {
                        if (!el) return;
                        const anySelected = videoUrls.some((url) => selectedVideoUrls.includes(url));
                        const allSelected = videoUrls.every((url) => selectedVideoUrls.includes(url));
                        el.indeterminate = anySelected && !allSelected;
                      }}
                      onChange={(e) => { void toggleAllVideos(e.target.checked); }}
                    />
                    Select all videos for sharing
                  </label>
                )}

                {videoUrls.length === 0 ? (
                  <p className="bands-status">No videos added yet.</p>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.6rem' }}>
                    {videoUrls.map((url) => {
                      const media = parsePressKitMedia(url);
                      const selected = selectedVideoUrls.includes(url);
                      return (
                        <div key={url} style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', background: 'var(--surface)', borderRadius: '8px', border: '1px solid var(--border)', overflow: 'hidden' }}>
                          <div style={{ position: 'relative' }}>
                            {media ? (
                              media.provider === 'spotify' ? (
                                <iframe
                                  src={media.embedUrl}
                                  width="100%"
                                  height={media.embedHeight ?? 152}
                                  title="Spotify player"
                                  allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                                  loading="lazy"
                                />
                              ) : (
                                <iframe
                                  src={media.embedUrl}
                                  width="100%"
                                  title={`${media.provider} video`}
                                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                                  allowFullScreen
                                  loading="lazy"
                                  referrerPolicy="strict-origin-when-cross-origin"
                                  style={{ aspectRatio: '16 / 9', border: 0, display: 'block' }}
                                />
                              )
                            ) : (
                              <div style={{ aspectRatio: '16 / 9', display: 'grid', placeItems: 'center', color: 'var(--muted)' }}>Unsupported link</div>
                            )}

                            <label style={{ position: 'absolute', top: '6px', left: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '1.4rem', height: '1.4rem', background: 'rgba(0,0,0,0.5)', borderRadius: '4px', cursor: canEdit ? 'pointer' : 'default', zIndex: 1 }}>
                              <input
                                type="checkbox"
                                checked={selected}
                                disabled={!canEdit}
                                onChange={(e) => { void toggleVideoSelection(url, e.target.checked); }}
                                style={{ accentColor: 'var(--bands-hue)' }}
                              />
                            </label>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '0 0.4rem 0.4rem' }}>
                            <span style={{ flex: 1, minWidth: 0, fontSize: '0.75rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--muted)' }}>{url}</span>
                            {canEdit && (
                              <button
                                type="button"
                                className="title-rename-btn"
                                title="Remove video"
                                onClick={() => { void removeVideoUrl(url); }}
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>
          </div>
          </div>

        </div>

        {imagePreview && (
          <div className="image-lightbox-overlay" onClick={() => setImagePreview(null)} role="dialog" aria-modal="true" aria-label={`${imagePreview.title} preview`}>
            <div className="image-lightbox" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                className="image-lightbox-close"
                onClick={() => setImagePreview(null)}
                title="Close preview"
                aria-label="Close preview"
              >
                <X size={18} />
              </button>
              <img src={imagePreview.url} alt={imagePreview.title} className="image-lightbox-image" />
              <p className="image-lightbox-caption">{imagePreview.title}</p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
