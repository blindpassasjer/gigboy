import { useEffect, useRef, useState } from 'react';
import { useEditor, useEditorState, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Bold, Italic, List, ListOrdered, Heading2, Heading3, Minus, Undo, Redo, Link2, Download, Trash2, PenLine, Newspaper, X } from 'lucide-react';
import { collection, deleteDoc, doc, getDocs, query, setDoc } from 'firebase/firestore';
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import toast from '../utils/anchoredToast';
import { db, storage } from '../lib/firebase';
import { createPressKitShare } from '../lib/pressKitApi';
import { generatePressKitZip } from '../lib/pressKitZip';
import { ICON_OPTIONS } from '../lib/iconOptions';
import { createWebpThumbnail } from '../utils/imageThumbnail';
import type { PressKit } from '../types';
import { useBands } from '../context/BandsContext';

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
  const { deleteBandPressKit } = useBands();

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
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [imageRenameValue, setImageRenameValue] = useState('');
  const [imagePage, setImagePage] = useState(1);
  const [imagePreview, setImagePreview] = useState<{ url: string; title: string } | null>(null);

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

  const renameImageAsset = async (id: string, newTitle: string) => {
    const trimmed = newTitle.trim();
    if (!trimmed) return;
    setImageAssets((current) => current.map((a) => a.id === id ? { ...a, title: trimmed } : a));
    if (db) await setDoc(doc(db, 'bands', bandId, 'pressKitImages', id), { title: trimmed }, { merge: true });
    setRenamingId(null);
  };

  const toggleAllImages = async (attachAll: boolean) => {
    const next = attachAll ? imageAssets.map((a) => a.id) : [];
    setKitImageIds(next);
    if (db) await setDoc(doc(db, 'bands', bandId, 'pressKits', kit.id), { imageIds: next }, { merge: true });
  };

  const removeImageAsset = async (asset: PressKitImageAsset) => {
    if (!canEdit) return;
    if (storage && asset.storagePath) await deleteObject(ref(storage!, asset.storagePath)).catch(() => { /* best-effort */ });
    if (storage && asset.thumbStoragePath) await deleteObject(ref(storage!, asset.thumbStoragePath)).catch(() => { /* best-effort */ });
    if (db) await deleteDoc(doc(db, 'bands', bandId, 'pressKitImages', asset.id)).catch(() => { /* best-effort */ });
    setImageAssets((current) => current.filter((a) => a.id !== asset.id));
    const next = kitImageIds.filter((id) => id !== asset.id);
    setKitImageIds(next);
    if (db) await setDoc(doc(db, 'bands', bandId, 'pressKits', kit.id), { imageIds: next }, { merge: true });
  };

  // ── Share / Download ──────────────────────────────────────────────────────
  const [busyShare, setBusyShare] = useState(false);
  const [busyDownload, setBusyDownload] = useState(false);

  const attachedImages = imageAssets.filter((img) => kitImageIds.includes(img.id));
  const imageTotalPages = Math.max(1, Math.ceil(imageAssets.length / MEDIA_ITEMS_PER_PAGE));
  const imagePageStart = (imagePage - 1) * MEDIA_ITEMS_PER_PAGE;
  const pagedImageAssets = imageAssets.slice(imagePageStart, imagePageStart + MEDIA_ITEMS_PER_PAGE);

  const handleShare = async () => {
    if (!userId || !userEmail) { toast.error('You must be signed in to share.'); return; }
    setBusyShare(true);
    try {
      const richText = editor?.getHTML() ?? kit.richText ?? '';
      const result = await createPressKitShare({
        userId,
        userEmail,
        bandId,
        selectedStageplotIds: [],
        selectedRiderIds: [],
        texts: richText ? [{ title: kit.name, body: richText }] : [],
        images: attachedImages.map(({ title, url }) => ({ title, url })),
      });
      await navigator.clipboard.writeText(result.publicUrl);
      toast.success('Public link copied to clipboard.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create share link.');
    } finally {
      setBusyShare(false);
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
    if (!window.confirm(`Delete "${kit.name}"? This cannot be undone.`)) return;
    const error = await deleteBandPressKit(bandId, kit.id);
    if (error) { toast.error(error); return; }
    onDelete();
  };

  return (
    <section className="bands-page bands-page--library">
      <div className="setlist-shell">
        <div className="song-list-sticky">
          <header className="songlist-header bands-header setlist-header">
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
                  <h1 className="song-list-heading setlist-title">
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
                          <span className="song-list-heading-icon" aria-hidden="true">
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
                              {ICON_OPTIONS.map((emoji) => {
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
                      <span className="song-list-heading-icon" aria-hidden="true">{kit.icon}</span>
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
            <div className="setlist-header-actions">
              <button
                type="button"
                className="setlist-action-btn setlist-action-btn--accent"
                onClick={() => void handleShare()}
                disabled={busyShare}
                title="Copy public share link"
              >
                <Link2 size={14} />
              </button>
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

          {/* ── Images ─────────────────────────────────────────────────── */}
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
                      {renamingId === img.id ? (
                        <input
                          autoFocus
                          type="text"
                          value={imageRenameValue}
                          onChange={(e) => setImageRenameValue(e.target.value)}
                          onBlur={() => void renameImageAsset(img.id, imageRenameValue || img.title)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') void renameImageAsset(img.id, imageRenameValue || img.title);
                            if (e.key === 'Escape') setRenamingId(null);
                          }}
                          style={{ flex: 1, minWidth: 0, fontSize: '0.8rem', padding: '2px 6px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
                        />
                      ) : (
                        <span style={{ flex: 1, minWidth: 0, fontSize: '0.8rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--muted)' }}>{img.title}</span>
                      )}
                      {canEdit && (
                        <>
                          <button type="button" className="title-rename-btn" title="Rename image" onClick={() => { setRenamingId(img.id); setImageRenameValue(img.title); }}><PenLine size={13} /></button>
                          <button type="button" className="title-rename-btn" title="Delete image" onClick={() => void removeImageAsset(img)}><Trash2 size={13} /></button>
                        </>
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
