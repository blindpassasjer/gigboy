import { useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Bold, Italic, List, ListOrdered, Heading2, Heading3, Minus, Undo, Redo, ExternalLink, Download, Trash2 } from 'lucide-react';
import { collection, deleteDoc, doc, getDocs, query, setDoc } from 'firebase/firestore';
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import toast from '../utils/anchoredToast';
import { db, storage } from '../lib/firebase';
import { createPressKitShare } from '../lib/pressKitApi';
import { generatePressKitZip } from '../lib/pressKitZip';
import type { PressKit } from '../types';
import { useBands } from '../context/BandsContext';

interface PressKitImageAsset {
  id: string;
  title: string;
  url: string;
  storagePath?: string;
  mimeType?: string;
  sizeBytes?: number;
  createdAt?: string;
}

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
}

export default function PressKitView({ bandId, bandName, kit, canEdit, userId, userEmail, onDelete }: Props) {
  const { deleteBandPressKit } = useBands();

  // ── Rich text ────────────────────────────────────────────────────────────
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [busySave, setBusySave] = useState(false);

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
    setBusySave(true);
    try {
      await setDoc(doc(db, 'bands', bandId, 'pressKits', kit.id), { richText: html }, { merge: true });
    } catch {
      toast.error('Failed to save text.');
    } finally {
      setBusySave(false);
    }
  };

  // ── Images ───────────────────────────────────────────────────────────────
  const [imageAssets, setImageAssets] = useState<PressKitImageAsset[]>([]);
  const [loadingImages, setLoadingImages] = useState(false);
  const [busyUpload, setBusyUpload] = useState(false);
  const [dropActive, setDropActive] = useState(false);
  const [kitImageIds, setKitImageIds] = useState<string[]>(kit.imageIds ?? []);

  // Sync kitImageIds when kit prop changes
  useEffect(() => { setKitImageIds(kit.imageIds ?? []); }, [kit.id, kit.imageIds]);

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
            mimeType: typeof data.mimeType === 'string' ? data.mimeType : undefined,
            sizeBytes: typeof data.sizeBytes === 'number' ? data.sizeBytes : undefined,
            createdAt: typeof data.createdAt === 'string' ? data.createdAt : undefined,
          } as PressKitImageAsset;
        }).filter((a) => a.url.length > 0).sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
        setImageAssets(assets);
      })
      .catch(() => toast.error('Failed to load images.'))
      .finally(() => { if (mounted) setLoadingImages(false); });
    return () => { mounted = false; };
  }, [bandId]);

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
        const storageRef = ref(storage!, storagePath);
        await uploadBytes(storageRef, file, { contentType: file.type || undefined });
        const url = await getDownloadURL(storageRef);
        const title = file.name.replace(/\.[^.]+$/, '').trim() || 'Image';
        const createdAt = new Date().toISOString();
        if (db) {
          await setDoc(doc(db, 'bands', bandId, 'pressKitImages', imageId), {
            title, url, storagePath, mimeType: file.type || null, sizeBytes: file.size, createdAt, createdBy: userId ?? null,
          });
        }
        return { id: imageId, title, url, storagePath, mimeType: file.type || undefined, sizeBytes: file.size, createdAt } as PressKitImageAsset;
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

  const removeImageAsset = async (asset: PressKitImageAsset) => {
    if (!canEdit) return;
    if (storage && asset.storagePath) await deleteObject(ref(storage!, asset.storagePath)).catch(() => { /* best-effort */ });
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
          <header className="songlist-header setlist-header">
            <div className="setlist-title-block">
              <h1 className="song-list-heading setlist-title">{kit.name}</h1>
              <p className="setlist-subtitle">{busySave ? 'Saving…' : 'Press kit'}</p>
            </div>
            <div className="setlist-header-actions">
              <button
                type="button"
                className="setlist-action-btn setlist-action-btn--secondary"
                onClick={() => void handleShare()}
                disabled={busyShare}
                title="Copy public share link"
              >
                <ExternalLink size={14} />
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
                  className="setlist-action-btn setlist-action-btn--danger"
                  onClick={() => void handleDelete()}
                  title="Delete press kit"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          </header>

          {canEdit && editor && (
            <div className="press-kit-toolbar">
              <button type="button" title="Bold" className={`press-kit-toolbar-btn${editor.isActive('bold') ? ' active' : ''}`} onClick={() => editor.chain().focus().toggleBold().run()}><Bold size={14} /></button>
              <button type="button" title="Italic" className={`press-kit-toolbar-btn${editor.isActive('italic') ? ' active' : ''}`} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic size={14} /></button>
              <span className="press-kit-toolbar-sep" />
              <button type="button" title="Heading 2" className={`press-kit-toolbar-btn${editor.isActive('heading', { level: 2 }) ? ' active' : ''}`} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 size={14} /></button>
              <button type="button" title="Heading 3" className={`press-kit-toolbar-btn${editor.isActive('heading', { level: 3 }) ? ' active' : ''}`} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}><Heading3 size={14} /></button>
              <span className="press-kit-toolbar-sep" />
              <button type="button" title="Bullet list" className={`press-kit-toolbar-btn${editor.isActive('bulletList') ? ' active' : ''}`} onClick={() => editor.chain().focus().toggleBulletList().run()}><List size={14} /></button>
              <button type="button" title="Ordered list" className={`press-kit-toolbar-btn${editor.isActive('orderedList') ? ' active' : ''}`} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered size={14} /></button>
              <span className="press-kit-toolbar-sep" />
              <button type="button" title="Horizontal rule" className="press-kit-toolbar-btn" onClick={() => editor.chain().focus().setHorizontalRule().run()}><Minus size={14} /></button>
              <span className="press-kit-toolbar-sep" />
              <button type="button" title="Undo" className="press-kit-toolbar-btn" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()}><Undo size={14} /></button>
              <button type="button" title="Redo" className="press-kit-toolbar-btn" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()}><Redo size={14} /></button>
            </div>
          )}
        </div>

        <div className="press-kit-editor-wrap">
          <EditorContent editor={editor} className="press-kit-editor" />
        </div>

        {/* ── Images ───────────────────────────────────────────────────── */}
        <div className="setlist-notes-editor" style={{ marginTop: '1.5rem' }}>
          <p className="songlist-item-meta" style={{ marginBottom: '0.5rem', fontWeight: 600 }}>Images</p>

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
                border: dropActive ? '2px solid var(--bands-hue)' : '1px dashed var(--border)',
                borderRadius: '10px',
                padding: '0.75rem',
                background: dropActive ? 'var(--bands-hue-soft)' : 'var(--surface)',
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

          {imageAssets.map((img) => {
            const attached = kitImageIds.includes(img.id);
            return (
              <div key={img.id} className="songlist-item" style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '0.5rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flex: 1, minWidth: 0 }}>
                  <input
                    type="checkbox"
                    checked={attached}
                    disabled={!canEdit}
                    onChange={(e) => void toggleKitImage(img.id, e.target.checked)}
                  />
                  <img src={img.url} alt={img.title} style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '6px', flexShrink: 0 }} />
                  <span className="songlist-item-title" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{img.title}</span>
                </label>
                {canEdit && (
                  <button type="button" className="setlist-action-btn setlist-action-btn--danger" onClick={() => void removeImageAsset(img)}>Delete</button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
