import { useCallback, useEffect, useMemo, useState } from 'react';
import type { User } from '../context/AuthContext';
import { db } from '../lib/firebase';
import {
  deleteSongHandNote,
  loadSongHandNotes,
  saveSongHandNote,
  type SongHandNotesScope,
} from '../lib/songHandNotes';
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

  useEffect(() => {
    if (!enabled) {
      setVisibleAuthorIds([]);
      return;
    }

    if (!userId) {
      setVisibleAuthorIds([]);
      return;
    }

    setVisibleAuthorIds([userId]);
  }, [enabled, ownerId, bandId, songId, userId]);

  useEffect(() => {
    if (!enabled || !db || !scope) {
      setNotes([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    loadSongHandNotes(db, scope, songId)
      .then((loaded) => {
        setNotes(loaded);
      })
      .catch((error) => {
        console.error('Failed to load song hand notes.', error);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [enabled, scope, songId]);

  useEffect(() => {
    if (!userId) {
      setVisibleAuthorIds([]);
      return;
    }

    setVisibleAuthorIds((prev) => {
      const authorIds = Array.from(new Set(notes.map((note) => note.authorUid).filter(Boolean)));

      if (authorIds.length === 0) {
        return [userId];
      }

      if (prev.length === 0) {
        return authorIds;
      }

      const validIds = new Set(authorIds);
      validIds.add(userId);
      const next = prev.filter((authorId) => validIds.has(authorId));

      // If the current selection no longer maps to any available note author
      // (for example "Mine" but user has no note), show available authors.
      if (next.some((authorId) => authorIds.includes(authorId))) {
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

    const nextNote: SongHandNoteDocument = {
      authorUid: userId,
      authorName: displayNameForUser(user),
      authorAvatar: user.avatar,
      updatedAt: new Date().toISOString(),
      viewport,
      strokes,
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

  const showMineOnly = useCallback(() => {
    if (!userId) {
      setVisibleAuthorIds([]);
      return;
    }

    setVisibleAuthorIds([userId]);
  }, [userId]);

  const showAll = useCallback(() => {
    setVisibleAuthorIds(authors.map((author) => author.uid));
  }, [authors]);

  const toggleVisibleAuthor = useCallback((authorId: string) => {
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
    showMineOnly,
    showAll,
    toggleVisibleAuthor,
  };
}
