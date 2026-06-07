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

  // Reset editing state when type mode is turned off
  useEffect(() => {
    if (!typeEnabled) {
      setPendingNew(null);
      setPendingNewText('');
      setEditingId(null);
      setPendingEditText('');
    }
  }, [typeEnabled]);

  const getPositionFromClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const stage = stageRef.current;
    if (!stage) return null;
    const rect = stage.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return {
      x: clamp01((e.clientX - rect.left) / rect.width),
      y: clamp01((e.clientY - rect.top) / rect.height),
    };
  }, []);

  const handleStageClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!typeEnabled) return;
    // Don't create a new note if clicking on an existing bubble
    if ((e.target as HTMLElement).closest('.song-text-bubble')) return;

    const pos = getPositionFromClick(e);
    if (!pos) return;

    setPendingNew({ id: crypto.randomUUID(), x: pos.x, y: pos.y });
    setPendingNewText('');
  }, [typeEnabled, getPositionFromClick]);

  const commitPendingNew = useCallback(() => {
    const text = pendingNewText.trim();
    if (text && pendingNew) {
      const newNote: TextNote = {
        id: pendingNew.id,
        x: pendingNew.x,
        y: pendingNew.y,
        text,
        createdAt: new Date().toISOString(),
      };
      onMyTextNotesChange([...myTextNotes, newNote]);
    }
    setPendingNew(null);
    setPendingNewText('');
  }, [pendingNew, pendingNewText, myTextNotes, onMyTextNotesChange]);

  const commitEdit = useCallback(() => {
    if (!editingId) return;
    const text = pendingEditText.trim();
    const nextNotes = text
      ? myTextNotes.map((n) => n.id === editingId ? { ...n, text } : n)
      : myTextNotes.filter((n) => n.id !== editingId);
    onMyTextNotesChange(nextNotes);
    setEditingId(null);
    setPendingEditText('');
  }, [editingId, pendingEditText, myTextNotes, onMyTextNotesChange]);

  const handleDeleteNote = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onMyTextNotesChange(myTextNotes.filter((n) => n.id !== id));
    if (editingId === id) {
      setEditingId(null);
      setPendingEditText('');
    }
  }, [myTextNotes, onMyTextNotesChange, editingId]);

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
        return (
          <div
            key={note.id}
            className={`song-text-bubble song-text-bubble--mine${isEditing ? ' song-text-bubble--editing' : ''}`}
            style={{
              left: `${note.x * 100}%`,
              top: `${note.y * 100}%`,
              '--bubble-color': noteColor,
            } as CSSProperties}
            onClick={(e) => e.stopPropagation()}
          >
            {isEditing ? (
              <textarea
                className="song-text-bubble-input"
                autoFocus
                value={pendingEditText}
                onChange={(e) => setPendingEditText(e.target.value)}
                onBlur={commitEdit}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') commitEdit();
                }}
              />
            ) : (
              <div
                className="song-text-bubble-content"
                onClick={() => {
                  if (!typeEnabled) return;
                  setEditingId(note.id);
                  setPendingEditText(note.text);
                }}
              >
                {note.text}
              </div>
            )}
            {typeEnabled && !isEditing && (
              <button
                className="song-text-bubble-delete"
                onClick={(e) => handleDeleteNote(note.id, e)}
                aria-label="Delete note"
                title="Delete note"
              >
                <X size={10} />
              </button>
            )}
          </div>
        );
      })}

      {/* New bubble being created */}
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
              if (e.key === 'Escape') {
                setPendingNew(null);
                setPendingNewText('');
              }
            }}
          />
        </div>
      )}
    </div>
  );
}
