import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { X } from 'lucide-react';
import { clamp01 } from '../lib/songHandNotes';
import { getUserNoteColor } from '../lib/userColors';
import type { SongHandNoteDocument, TextNote } from '../types';

interface Props {
  visible: boolean;
  typeEnabled: boolean;
  notes: SongHandNoteDocument[];
  myTextNotes: TextNote[];
  myAuthorUid: string;
  noteColor: string;
  onMyTextNotesChange: (textNotes: TextNote[]) => void;
}

interface PendingNew {
  id: string;
  x: number;
  y: number;
}

interface DragPosition {
  id: string;
  x: number;
  y: number;
}

// Minimum normalised distance (in stage-width units) before a pointerdown is
// treated as a drag instead of a tap-to-edit.
const DRAG_THRESHOLD = 0.008;

export default function SongTextNotesOverlay({
  visible,
  typeEnabled,
  notes,
  myTextNotes,
  myAuthorUid,
  noteColor,
  onMyTextNotesChange,
}: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [pendingNew, setPendingNew] = useState<PendingNew | null>(null);
  const [pendingNewText, setPendingNewText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingEditText, setPendingEditText] = useState('');

  // Prevents the stage click that fires immediately after a textarea blur from
  // opening a new bubble (blur fires before click in the same event sequence).
  const suppressNextClickRef = useRef(false);

  // Drag state
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragPosition, setDragPosition] = useState<DragPosition | null>(null);
  const dragStartRef = useRef<{ clientX: number; clientY: number; noteX: number; noteY: number } | null>(null);
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

  const getStageRect = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return null;
    const rect = stage.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return rect;
  }, []);

  // ── Stage click: create a new bubble at the clicked position ──────────────
  const handleStageClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!typeEnabled) return;
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false;
      return;
    }
    if ((e.target as HTMLElement).closest('.song-text-bubble')) return;
    const rect = getStageRect();
    if (!rect) return;
    setPendingNew({
      id: crypto.randomUUID(),
      x: clamp01((e.clientX - rect.left) / rect.width),
      y: clamp01((e.clientY - rect.top) / rect.height),
    });
    setPendingNewText('');
  }, [typeEnabled, getStageRect]);

  // ── Commit / discard the new bubble being typed ───────────────────────────
  const commitPendingNew = useCallback(() => {
    suppressNextClickRef.current = true;
    const text = pendingNewText.trim();
    if (text && pendingNew) {
      onMyTextNotesChange([...myTextNotes, {
        id: pendingNew.id,
        x: pendingNew.x,
        y: pendingNew.y,
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
    note: TextNote,
  ) => {
    if (!typeEnabled || editingId === note.id) return;
    e.stopPropagation();
    e.preventDefault();
    setDraggingId(note.id);
    hasDraggedRef.current = false;
    dragStartRef.current = { clientX: e.clientX, clientY: e.clientY, noteX: note.x, noteY: note.y };
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
  }, [typeEnabled, editingId]);

  const handleBubblePointerMove = useCallback((
    e: React.PointerEvent<HTMLDivElement>,
    note: TextNote,
  ) => {
    if (draggingId !== note.id || !dragStartRef.current) return;
    const rect = getStageRect();
    if (!rect) return;
    const dx = (e.clientX - dragStartRef.current.clientX) / rect.width;
    const dy = (e.clientY - dragStartRef.current.clientY) / rect.height;
    if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
      hasDraggedRef.current = true;
    }
    if (hasDraggedRef.current) {
      setDragPosition({
        id: note.id,
        x: clamp01(dragStartRef.current.noteX + dx),
        y: clamp01(dragStartRef.current.noteY + dy),
      });
    }
  }, [draggingId, getStageRect]);

  const handleBubblePointerUp = useCallback((
    e: React.PointerEvent<HTMLDivElement>,
    note: TextNote,
  ) => {
    if (draggingId !== note.id) return;
    e.stopPropagation();

    if (hasDraggedRef.current && dragPosition) {
      // Commit moved position
      onMyTextNotesChange(myTextNotes.map((n) =>
        n.id === note.id ? { ...n, x: dragPosition.x, y: dragPosition.y } : n,
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

  if (!visible) return null;

  const otherTextNotes = notes
    .filter((n) => n.authorUid !== myAuthorUid)
    .flatMap((n) =>
      (n.textNotes ?? []).map((tn) => ({
        ...tn,
        authorUid: n.authorUid,
        authorName: n.authorName ?? null,
      }))
    );

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
              left: `${tn.x * 100}%`,
              top: `${tn.y * 100}%`,
              '--bubble-color': color,
            } as CSSProperties}
          >
            <div className="song-text-bubble-content">{tn.text}</div>
          </div>
        );
      })}

      {/* Current user's committed text notes */}
      {myTextNotes.map((note) => {
        const isEditing = editingId === note.id;
        const isDragging = draggingId === note.id;
        const displayX = isDragging && dragPosition ? dragPosition.x : note.x;
        const displayY = isDragging && dragPosition ? dragPosition.y : note.y;
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
              left: `${displayX * 100}%`,
              top: `${displayY * 100}%`,
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
            left: `${pendingNew.x * 100}%`,
            top: `${pendingNew.y * 100}%`,
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
