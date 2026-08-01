import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { User } from '../context/AuthContext';
import { db } from '../lib/firebase';
import {
  deleteSongHandNote,
  saveSongHandNote,
  subscribeToSongHandNotes,
  type SongHandNotesScope,
} from '../lib/songHandNotes';
import { getUserNoteColor } from '../lib/userColors';
import type {
  LyricNoteStroke,
  SongHandNoteAuthor,
  LyricNoteDocument,
  LyricTextNote,
} from '../types';

function displayNameForUser(user: User) {
  return user.fullName?.trim() || user.username?.trim() || user.email || 'Unknown user';
}

export function useSongHandNotes(params: {
  ownerId: string | null;
  bandId?: string | null;
  songId: string;
  user: User | null;
  enabled: boolean;
  isOwner?: boolean;
  /** When true, only the current user's notes are visible by default (others can be toggled on) */
  defaultToCurrentUser?: boolean;
}) {
  const { ownerId, bandId, songId, user, enabled, isOwner = false, defaultToCurrentUser = false } = params;
  const userId = user?.id ?? null;
  const scope = useMemo<SongHandNotesScope | null>(() => {
    if (bandId) return { type: 'band', bandId };
    if (ownerId) return { type: 'user', ownerId };
    return null;
  }, [bandId, ownerId]);

  const [loading, setLoading] = useState(false);
  const [notes, setNotes] = useState<LyricNoteDocument[]>([]);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [visibleAuthorIds, setVisibleAuthorIds] = useState<string[]>([]);
  const hasManualVisibilitySelectionRef = useRef(false);

  // Undo/redo stacks of stroke snapshots for the current user's own strokes.
  // Reset whenever the song changes so history doesn't leak across songs.
  const [undoStack, setUndoStack] = useState<LyricNoteStroke[][]>([]);
  const [redoStack, setRedoStack] = useState<LyricNoteStroke[][]>([]);
  useEffect(() => {
    setUndoStack([]);
    setRedoStack([]);
  }, [songId]);

  useEffect(() => {
    if (!enabled) {
      setVisibleAuthorIds([]);
      hasManualVisibilitySelectionRef.current = false;
      return;
    }

    if (!userId) {
      setVisibleAuthorIds([]);
      hasManualVisibilitySelectionRef.current = false;
      return;
    }

    hasManualVisibilitySelectionRef.current = false;
    setVisibleAuthorIds([]);
  }, [enabled, ownerId, bandId, songId, userId]);

  useEffect(() => {
    if (!enabled || !db || !scope) {
      setNotes([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubscribe = subscribeToSongHandNotes(db, scope, songId, (loaded) => {
      setNotes(loaded);
      setLoading(false);
    });

    return () => {
      unsubscribe();
      setLoading(false);
    };
  }, [enabled, scope, songId]);

  useEffect(() => {
    if (!userId) {
      setVisibleAuthorIds([]);
      return;
    }

    const authorIds = Array.from(new Set(notes.map((note) => note.authorUid).filter(Boolean)));

    if (!hasManualVisibilitySelectionRef.current) {
      setVisibleAuthorIds(defaultToCurrentUser && userId ? [userId] : authorIds);
      return;
    }

    setVisibleAuthorIds((prev) => {
      if (authorIds.length === 0) return [];

      const validIds = new Set(authorIds);
      const next = prev.filter((authorId) => validIds.has(authorId));

      if (next.length > 0) {
        return next;
      }

      return authorIds;
    });
  }, [notes, userId]);

  const authors = useMemo<SongHandNoteAuthor[]>(() => {
    return notes.map((note) => ({
      uid: note.authorUid,
      name: note.authorName?.trim() || (note.authorUid === userId ? displayNameForUser(user as User) : `User ${note.authorUid.slice(0, 6)}`),
      avatar: note.authorAvatar ?? null,
    }));
  }, [notes, user, userId]);

  const visibleNotes = useMemo(() => {
    const colorizeByAuthor = (note: LyricNoteDocument): LyricNoteDocument => {
      const authorColor = getUserNoteColor(note.authorUid);
      return {
        ...note,
        strokes: note.strokes.map((stroke) => (
          stroke.color === authorColor
            ? stroke
            : { ...stroke, color: authorColor }
        )),
      };
    };

    if (visibleAuthorIds.length === 0) {
      if (defaultToCurrentUser || hasManualVisibilitySelectionRef.current) return [];
      return notes.map(colorizeByAuthor);
    }

    const visible = new Set(visibleAuthorIds);
    return notes
      .filter((note) => visible.has(note.authorUid))
      .map(colorizeByAuthor);
  }, [notes, visibleAuthorIds]);

  const myNote = useMemo(() => {
    if (!userId) return null;
    return notes.find((note) => note.authorUid === userId) ?? null;
  }, [notes, userId]);

  // Keep refs so save/undo/redo can read the latest values without being a dependency.
  const myNoteTextNotesRef = useRef<LyricTextNote[] | undefined>(undefined);
  useEffect(() => {
    myNoteTextNotesRef.current = myNote?.textNotes;
  }, [myNote?.textNotes]);

  const myStrokesRef = useRef<LyricNoteStroke[]>([]);
  useEffect(() => {
    myStrokesRef.current = myNote?.strokes ?? [];
  }, [myNote?.strokes]);

  const persistStrokes = useCallback(async (strokes: LyricNoteStroke[]) => {
    if (!db || !scope || !userId || !user) return;

    // Normalize all strokes to user's assigned color
    const userColor = getUserNoteColor(userId);
    const normalizedStrokes = strokes.map((stroke) => ({
      ...stroke,
      color: userColor,
    }));

    const nextNote: LyricNoteDocument = {
      authorUid: userId,
      authorName: displayNameForUser(user),
      ...(user.avatar != null ? { authorAvatar: user.avatar } : {}),
      updatedAt: new Date().toISOString(),
      strokes: normalizedStrokes,
      ...(myNoteTextNotesRef.current?.length ? { textNotes: myNoteTextNotesRef.current } : {}),
    };

    setVisibleAuthorIds((prev) => {
      // In auto mode we always show all authors, so avoid forcing a single-author filter.
      if (!hasManualVisibilitySelectionRef.current) return prev;
      if (prev.includes(userId)) return prev;
      return [...prev, userId];
    });

    setNotes((prev) => {
      const withoutMine = prev.filter((entry) => entry.authorUid !== userId);
      return [nextNote, ...withoutMine];
    });

    setSaveState('saving');
    try {
      await saveSongHandNote({ db, scope, songId, note: nextNote });
      setSaveState('saved');
      window.setTimeout(() => {
        setSaveState((current) => (current === 'saved' ? 'idle' : current));
      }, 1500);
    } catch (error) {
      console.error('Failed to save song hand notes.', error);
      setSaveState('error');
    }
  }, [scope, songId, user, userId]);

  const saveMyNotes = useCallback(async (strokes: LyricNoteStroke[]) => {
    setUndoStack((prev) => [...prev, myStrokesRef.current].slice(-50));
    setRedoStack([]);
    await persistStrokes(strokes);
  }, [persistStrokes]);

  const undoStroke = useCallback(() => {
    setUndoStack((prev) => {
      if (prev.length === 0) return prev;
      const previousStrokes = prev[prev.length - 1];
      setRedoStack((redo) => [...redo, myStrokesRef.current].slice(-50));
      void persistStrokes(previousStrokes);
      return prev.slice(0, -1);
    });
  }, [persistStrokes]);

  const redoStroke = useCallback(() => {
    setRedoStack((prev) => {
      if (prev.length === 0) return prev;
      const nextStrokes = prev[prev.length - 1];
      setUndoStack((undo) => [...undo, myStrokesRef.current].slice(-50));
      void persistStrokes(nextStrokes);
      return prev.slice(0, -1);
    });
  }, [persistStrokes]);

  const saveMyTextNotes = useCallback(async (textNotes: LyricTextNote[]) => {
    if (!db || !scope || !userId || !user) return;

    const userColor = getUserNoteColor(userId);
    const normalizedStrokes = (myNote?.strokes ?? []).map((stroke) => ({
      ...stroke,
      color: userColor,
    }));

    const nextNote: LyricNoteDocument = {
      authorUid: userId,
      authorName: displayNameForUser(user),
      ...(user.avatar != null ? { authorAvatar: user.avatar } : {}),
      updatedAt: new Date().toISOString(),
      strokes: normalizedStrokes,
      ...(textNotes.length ? { textNotes } : {}),
    };

    setVisibleAuthorIds((prev) => {
      if (!hasManualVisibilitySelectionRef.current) return prev;
      if (prev.includes(userId)) return prev;
      return [...prev, userId];
    });

    setNotes((prev) => {
      const withoutMine = prev.filter((entry) => entry.authorUid !== userId);
      return [nextNote, ...withoutMine];
    });

    setSaveState('saving');
    try {
      await saveSongHandNote({ db, scope, songId, note: nextNote });
      setSaveState('saved');
      window.setTimeout(() => {
        setSaveState((current) => (current === 'saved' ? 'idle' : current));
      }, 1500);
    } catch (error) {
      console.error('Failed to save song text notes.', error);
      setSaveState('error');
    }
  }, [myNote, scope, songId, user, userId]);

  const clearMyNotes = useCallback(async () => {
    if (!db || !scope || !userId) return;

    setUndoStack((prev) => [...prev, myStrokesRef.current].slice(-50));
    setRedoStack([]);

    const previousNotes = notes;
    setNotes((prev) => prev.filter((entry) => entry.authorUid !== userId));
    setSaveState('saving');

    try {
      await deleteSongHandNote({ db, scope, songId, authorUid: userId });
      setSaveState('saved');
      window.setTimeout(() => {
        setSaveState((current) => (current === 'saved' ? 'idle' : current));
      }, 1500);
    } catch (error) {
      console.error('Failed to clear song hand notes.', error);
      setNotes(previousNotes);
      setSaveState('error');
    }
  }, [notes, scope, songId, userId]);

  const deleteNotesByAuthor = useCallback(async (authorUid: string) => {
    if (!db || !scope || !isOwner || authorUid === userId) return;

    const previousNotes = notes;
    setNotes((prev) => prev.filter((entry) => entry.authorUid !== authorUid));

    try {
      await deleteSongHandNote({ db, scope, songId, authorUid });
    } catch (error) {
      console.error('Failed to delete notes by author.', error);
      setNotes(previousNotes);
    }
  }, [notes, scope, songId, isOwner, userId]);

  const showAll = useCallback(() => {
    hasManualVisibilitySelectionRef.current = true;
    setVisibleAuthorIds(authors.map((author) => author.uid));
  }, [authors]);

  const toggleVisibleAuthor = useCallback((authorId: string) => {
    hasManualVisibilitySelectionRef.current = true;
    setVisibleAuthorIds((prev) => {
      if (prev.includes(authorId)) {
        return prev.filter((entry) => entry !== authorId);
      }
      return [...prev, authorId];
    });
  }, []);

  return {
    loading,
    notes,
    authors,
    visibleNotes,
    visibleAuthorIds,
    saveState,
    myStrokes: myNote?.strokes ?? [],
    myTextNotes: myNote?.textNotes ?? [],
    saveMyNotes,
    saveMyTextNotes,
    clearMyNotes,
    deleteNotesByAuthor,
    showAll,
    toggleVisibleAuthor,
    undoStroke,
    redoStroke,
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
  };
}
