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
  HandNoteStroke,
  SongHandNoteAuthor,
  SongHandNoteDocument,
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
}) {
  const { ownerId, bandId, songId, user, enabled } = params;
  const userId = user?.id ?? null;
  const scope = useMemo<SongHandNotesScope | null>(() => {
    if (bandId) return { type: 'band', bandId };
    if (ownerId) return { type: 'user', ownerId };
    return null;
  }, [bandId, ownerId]);

  const [loading, setLoading] = useState(false);
  const [notes, setNotes] = useState<SongHandNoteDocument[]>([]);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [visibleAuthorIds, setVisibleAuthorIds] = useState<string[]>([]);
  const hasManualVisibilitySelectionRef = useRef(false);

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
      setVisibleAuthorIds(authorIds);
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
    if (visibleAuthorIds.length === 0) return notes;
    const visible = new Set(visibleAuthorIds);
    return notes.filter((note) => visible.has(note.authorUid));
  }, [notes, visibleAuthorIds]);

  const myNote = useMemo(() => {
    if (!userId) return null;
    return notes.find((note) => note.authorUid === userId) ?? null;
  }, [notes, userId]);

  const saveMyNotes = useCallback(async (strokes: HandNoteStroke[], viewport: { width: number; height: number }) => {
    if (!db || !scope || !userId || !user) return;

    // Normalize all strokes to user's assigned color
    const userColor = getUserNoteColor(userId);
    const normalizedStrokes = strokes.map((stroke) => ({
      ...stroke,
      color: userColor,
    }));

    const nextNote: SongHandNoteDocument = {
      authorUid: userId,
      authorName: displayNameForUser(user),
      authorAvatar: user.avatar,
      updatedAt: new Date().toISOString(),
      viewport,
      strokes: normalizedStrokes,
    };

    setVisibleAuthorIds((prev) => {
      if (prev.includes(userId)) return prev;
      if (prev.length === 0) return [userId];
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

  const clearMyNotes = useCallback(async () => {
    if (!db || !scope || !userId) return;

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
    saveMyNotes,
    clearMyNotes,
    showAll,
    toggleVisibleAuthor,
  };
}
