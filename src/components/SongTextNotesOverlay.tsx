import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { X } from 'lucide-react';
import { anchorFromClientPoint, findContentStage, pointFromAnchor, resolveLineRects } from '../lib/lineAnchor';
import { getUserNoteColor } from '../lib/userColors';
import { generateId } from '../lib/uuid';
import type { LineAnchor, LyricNoteDocument, LyricTextNote } from '../types';

interface Props {
  visible: boolean;
  typeEnabled: boolean;
  notes: LyricNoteDocument[];
  myTextNotes: LyricTextNote[];
  myAuthorUid: string;
  myNotesVisible: boolean;
  noteColor: string;
  onMyTextNotesChange: (textNotes: LyricTextNote[]) => void;
}

interface PendingNew {
  id: string;
  anchor: LineAnchor;
}

interface DragPosition {
  id: string;
  anchor: LineAnchor;
}

// Minimum screen-pixel distance before a pointerdown is treated as a drag instead of a tap-to-edit.
const DRAG_THRESHOLD_PX = 6;

export default function SongTextNotesOverlay({
  visible,
  typeEnabled,
  notes,
  myTextNotes,
  myAuthorUid,
  myNotesVisible,
  noteColor,
  onMyTextNotesChange,
}: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [pendingNew, setPendingNew] = useState<PendingNew | null>(null);
  const [pendingNewText, setPendingNewText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingEditText, setPendingEditText] = useState('');

  // Re-render on resize/reflow so bubble positions (resolved from line anchors) stay current.
  const [, setLayoutRevision] = useState(0);

  // Prevents the stage click that fires immediately after a textarea blur from
  // opening a new bubble (blur fires before click in the same event sequence).
  const suppressNextClickRef = useRef(false);

  // Drag state
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragPosition, setDragPosition] = useState<DragPosition | null>(null);
  const dragStartRef = useRef<{ clientX: number; clientY: number } | null>(null);
  const hasDraggedRef = useRef(false);

  // Reset all transient state when type mode is turned off
  useEffect(() => {
    if (!typeEnabled) {
      setPendingNew(null);
      setPendingNewText('');
      setEditingId(null);
      setPendingEditText('');
      setDraggingId(null);
      setDragPosition(null);
      dragStartRef.current = null;
      hasDraggedRef.current = false;
    }
  }, [typeEnabled]);

  useEffect(() => {
    if (!visible) return;
    const element = stageRef.current;
    if (!element) return;

    const bump = () => setLayoutRevision((r) => r + 1);
    const raf1 = window.requestAnimationFrame(bump);
    const raf2 = window.requestAnimationFrame(bump);

    const observer = new ResizeObserver(bump);
    observer.observe(element);
    window.addEventListener('resize', bump);

    return () => {
      window.cancelAnimationFrame(raf1);
      window.cancelAnimationFrame(raf2);
      observer.disconnect();
      window.removeEventListener('resize', bump);
    };
  }, [visible, notes]);

  const getContentStage = useCallback(() => findContentStage(stageRef.current), []);

  /** Resolves a stored anchor to a `{left%, top%}` style relative to the overlay stage. */
  const styleForAnchor = useCallback((anchor: LineAnchor): CSSProperties => {
    const overlay = stageRef.current;
    const contentStage = getContentStage();
    if (!overlay || !contentStage) return { left: '0%', top: '0%' };

    const overlayRect = overlay.getBoundingClientRect();
    const stageRect = contentStage.getBoundingClientRect();
    const lineRects = resolveLineRects(contentStage);
    const point = pointFromAnchor(lineRects, anchor);
    if (!point) return { left: '0%', top: '0%' };

    // Convert from contentStage-relative px to overlay-relative percentage
    // (the overlay and contentStage share the same box, but resolve independently to be safe).
    const offsetX = stageRect.left - overlayRect.left;
    const offsetY = stageRect.top - overlayRect.top;
    const width = Math.max(overlayRect.width, 1);
    const height = Math.max(overlayRect.height, 1);

    return {
      left: `${((point.x + offsetX) / width) * 100}%`,
      top: `${((point.y + offsetY) / height) * 100}%`,
    };
  }, [getContentStage]);

  // ── Stage click: create a new bubble at the clicked position ──────────────
  const handleStageClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!typeEnabled) return;
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false;
      return;
    }
    if ((e.target as HTMLElement).closest('.song-text-bubble')) return;
    const contentStage = getContentStage();
    if (!contentStage) return;
    const anchor = anchorFromClientPoint(contentStage, e.clientX, e.clientY);
    if (!anchor) return;
    setPendingNew({ id: generateId(), anchor });
    setPendingNewText('');
  }, [typeEnabled, getContentStage]);

  // ── Commit / discard the new bubble being typed ───────────────────────────
  const commitPendingNew = useCallback(() => {
    suppressNextClickRef.current = true;
    const text = pendingNewText.trim();
    if (text && pendingNew) {
      onMyTextNotesChange([...myTextNotes, {
        id: pendingNew.id,
        ...pendingNew.anchor,
        text,
        createdAt: new Date().toISOString(),
      }]);
    }
    setPendingNew(null);
    setPendingNewText('');
  }, [pendingNew, pendingNewText, myTextNotes, onMyTextNotesChange]);

  // ── Commit / discard an in-place edit ────────────────────────────────────
  const commitEdit = useCallback(() => {
    if (!editingId) return;
    suppressNextClickRef.current = true;
    const text = pendingEditText.trim();
    onMyTextNotesChange(
      text
        ? myTextNotes.map((n) => n.id === editingId ? { ...n, text } : n)
        : myTextNotes.filter((n) => n.id !== editingId),
    );
    setEditingId(null);
    setPendingEditText('');
  }, [editingId, pendingEditText, myTextNotes, onMyTextNotesChange]);

  // ── Delete a bubble ───────────────────────────────────────────────────────
  const handleDeleteNote = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onMyTextNotesChange(myTextNotes.filter((n) => n.id !== id));
    if (editingId === id) { setEditingId(null); setPendingEditText(''); }
  }, [myTextNotes, onMyTextNotesChange, editingId]);

  // ── Drag handlers (on the bubble element itself) ──────────────────────────
  const handleBubblePointerDown = useCallback((
    e: React.PointerEvent<HTMLDivElement>,
    note: LyricTextNote,
  ) => {
    if (!typeEnabled || editingId === note.id) return;
    e.stopPropagation();
    e.preventDefault();
    setDraggingId(note.id);
    hasDraggedRef.current = false;
    dragStartRef.current = { clientX: e.clientX, clientY: e.clientY };
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
  }, [typeEnabled, editingId]);

  const handleBubblePointerMove = useCallback((
    e: React.PointerEvent<HTMLDivElement>,
    note: LyricTextNote,
  ) => {
    if (draggingId !== note.id || !dragStartRef.current) return;
    const contentStage = getContentStage();
    if (!contentStage) return;

    const dx = e.clientX - dragStartRef.current.clientX;
    const dy = e.clientY - dragStartRef.current.clientY;
    if (Math.abs(dx) > DRAG_THRESHOLD_PX || Math.abs(dy) > DRAG_THRESHOLD_PX) {
      hasDraggedRef.current = true;
    }
    if (hasDraggedRef.current) {
      const anchor = anchorFromClientPoint(contentStage, e.clientX, e.clientY);
      if (anchor) setDragPosition({ id: note.id, anchor });
    }
  }, [draggingId, getContentStage]);

  const handleBubblePointerUp = useCallback((
    e: React.PointerEvent<HTMLDivElement>,
    note: LyricTextNote,
  ) => {
    if (draggingId !== note.id) return;
    e.stopPropagation();

    if (hasDraggedRef.current && dragPosition) {
      // Commit moved position
      onMyTextNotesChange(myTextNotes.map((n) =>
        n.id === note.id ? { ...n, ...dragPosition.anchor } : n,
      ));
    } else {
      // Tap: open for editing
      setEditingId(note.id);
      setPendingEditText(note.text);
    }

    setDraggingId(null);
    setDragPosition(null);
    dragStartRef.current = null;
    hasDraggedRef.current = false;
  }, [draggingId, dragPosition, myTextNotes, onMyTextNotesChange]);

  const otherTextNotes = useMemo(() => notes
    .filter((n) => n.authorUid !== myAuthorUid)
    .flatMap((n) =>
      (n.textNotes ?? []).map((tn) => ({
        ...tn,
        authorUid: n.authorUid,
        authorName: n.authorName ?? null,
      }))
    ), [notes, myAuthorUid]);

  if (!visible) return null;

  return (
    <div
      ref={stageRef}
      className={`song-text-notes-overlay${typeEnabled ? ' song-text-notes-overlay--active' : ''}`}
      onClick={handleStageClick}
    >
      {/* Other users' text notes (read-only) */}
      {otherTextNotes.map((tn) => {
        const color = getUserNoteColor(tn.authorUid);
        return (
          <div
            key={`${tn.authorUid}-${tn.id}`}
            className="song-text-bubble song-text-bubble--readonly"
            style={{
              ...styleForAnchor(tn),
              '--bubble-color': color,
            } as CSSProperties}
          >
            <div className="song-text-bubble-content">{tn.text}</div>
          </div>
        );
      })}

      {/* Current user's committed text notes */}
      {myNotesVisible && myTextNotes.map((note) => {
        const isEditing = editingId === note.id;
        const isDragging = draggingId === note.id;
        const displayAnchor = isDragging && dragPosition ? dragPosition.anchor : note;
        return (
          <div
            key={note.id}
            className={[
              'song-text-bubble',
              'song-text-bubble--mine',
              isEditing ? 'song-text-bubble--editing' : '',
              isDragging ? 'song-text-bubble--dragging' : '',
            ].filter(Boolean).join(' ')}
            style={{
              ...styleForAnchor(displayAnchor),
              '--bubble-color': noteColor,
            } as CSSProperties}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => handleBubblePointerDown(e, note)}
            onPointerMove={(e) => handleBubblePointerMove(e, note)}
            onPointerUp={(e) => handleBubblePointerUp(e, note)}
          >
            {isEditing ? (
              <textarea
                className="song-text-bubble-input"
                autoFocus
                value={pendingEditText}
                onChange={(e) => setPendingEditText(e.target.value)}
                onBlur={commitEdit}
                onKeyDown={(e) => { if (e.key === 'Escape') commitEdit(); }}
                onPointerDown={(e) => e.stopPropagation()}
              />
            ) : (
              <div className="song-text-bubble-content">{note.text}</div>
            )}
            {typeEnabled && !isEditing && (
              <button
                className="song-text-bubble-delete"
                onClick={(e) => handleDeleteNote(note.id, e)}
                onPointerDown={(e) => e.stopPropagation()}
                aria-label="Delete note"
                title="Delete note"
              >
                <X size={10} />
              </button>
            )}
          </div>
        );
      })}

      {/* New bubble being typed */}
      {pendingNew && (
        <div
          className="song-text-bubble song-text-bubble--mine song-text-bubble--editing"
          style={{
            ...styleForAnchor(pendingNew.anchor),
            '--bubble-color': noteColor,
          } as CSSProperties}
          onClick={(e) => e.stopPropagation()}
        >
          <textarea
            className="song-text-bubble-input"
            autoFocus
            placeholder="Type a note…"
            value={pendingNewText}
            onChange={(e) => setPendingNewText(e.target.value)}
            onBlur={commitPendingNew}
            onKeyDown={(e) => {
              if (e.key === 'Escape') { setPendingNew(null); setPendingNewText(''); }
            }}
            onPointerDown={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
