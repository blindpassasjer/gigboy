/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';
import type { Setlist } from '../types';
import { dataClient } from '../lib/dataClient';
import { useAuth } from './AuthContext';
import { moveIdBefore } from '../utils/arrayUtils';

const KEY_SETLISTS = 'gigboy-setlists';
const KEY_ACTIVE_SETLIST = 'gigboy-active-setlist';

function readLocal<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;

  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeLocal<T>(key: string, value: T) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

function compareSetlists(a: Setlist, b: Setlist) {
  const aSortOrder = typeof a.sortOrder === 'number' ? a.sortOrder : Number.MAX_SAFE_INTEGER;
  const bSortOrder = typeof b.sortOrder === 'number' ? b.sortOrder : Number.MAX_SAFE_INTEGER;

  if (aSortOrder !== bSortOrder) {
    return aSortOrder - bSortOrder;
  }

  return a.name.localeCompare(b.name);
}

function normalizeSetlists(setlists: Setlist[]) {
  return [...setlists]
    .sort(compareSetlists)
    .map((setlist, index) => ({ ...setlist, sortOrder: index }));
}

function getRole(setlist: Setlist, userId: string | null): Setlist['accessRole'] {
  if (!userId) return undefined;
  const ownerId = setlist.ownerId;
  if (ownerId && ownerId === userId) return 'owner';
  const permission = setlist.collaborationPermissions?.[userId];
  if (permission === 'editor' || permission === 'viewer') return permission;
  return undefined;
}

function canEditSetlist(setlist: Setlist, userId: string | null) {
  const role = getRole(setlist, userId);
  return role === 'owner' || role === 'editor';
}

function isSetlistOwner(setlist: Setlist, userId: string | null) {
  const ownerId = setlist.ownerId ?? userId;
  return Boolean(userId && ownerId === userId);
}

interface SetlistsContextValue {
  setlists: Setlist[];
  activeSetlistId: string | null;
  addSetlist: (name: string) => void;
  deleteSetlist: (id: string) => void;
  renameSetlist: (id: string, name: string) => void;
  updateSetlistIcon: (id: string, icon?: string) => void;
  addSongToSetlist: (setlistId: string, songId: string) => void;
  removeSongFromSetlist: (setlistId: string, songId: string) => void;
  moveSongInSetlist: (setlistId: string, songId: string, beforeSongId: string | null) => void;
  updateSongNoteInSetlist: (setlistId: string, songId: string, note: string) => void;
  setActiveSetlistId: (id: string | null) => void;
  clearActiveSelection: () => void;
}

const SetlistsContext = createContext<SetlistsContextValue | null>(null);

export function SetlistsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [setlists, setSetlists] = useState<Setlist[]>(() =>
    normalizeSetlists(readLocal(KEY_SETLISTS, []))
  );
  const [activeSetlistId, setActiveSetlistId] = useState<string | null>(() =>
    readLocal(KEY_ACTIVE_SETLIST, null)
  );

  useEffect(() => {
    if (!userId) return;
    // Self-host's GET /api/setlists already includes setlists shared with the caller via an
    // accepted collaboration invite (server-side jsonb collaborator match) — see SongsContext.tsx.
    dataClient.setlists
      .list()
      .then((loaded) => setSetlists(normalizeSetlists(loaded)))
      .catch((err) => console.error('Failed to load setlists.', err));
  }, [userId]);

  useEffect(() => {
    writeLocal(KEY_SETLISTS, setlists);
  }, [setlists]);

  useEffect(() => {
    writeLocal(KEY_ACTIVE_SETLIST, activeSetlistId);
  }, [activeSetlistId]);

  const addSetlist = useCallback((name: string) => {
    const id = crypto.randomUUID();
    const nextSetlist: Setlist = {
      id,
      name,
      songIds: [],
      ownerId: userId ?? undefined,
      collaboratorIds: [],
      collaborationPermissions: {},
      accessRole: 'owner',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setSetlists((prev) => {
      const nextSetlists = normalizeSetlists([...prev, nextSetlist]);
      if (userId) {
        const changed = nextSetlists.filter((list) => {
          const p = prev.find((item) => item.id === list.id);
          return !p || p.sortOrder !== list.sortOrder;
        });
        Promise.all(changed.map((list) => dataClient.setlists.update(list))).catch((error) => {
          console.error('Failed to save setlists.', error);
          setSetlists(prev);
        });
      }
      return nextSetlists;
    });
  }, [userId]);

  const deleteSetlist = useCallback((id: string) => {
    setSetlists((prev) => {
      const deleting = prev.find((list) => list.id === id);
      if (!deleting || !isSetlistOwner(deleting, userId)) {
        return prev;
      }

      const nextSetlists = normalizeSetlists(prev.filter((list) => list.id !== id));
      if (userId) {
        const changed = nextSetlists.filter((list) => {
          const p = prev.find((item) => item.id === list.id);
          return p && p.sortOrder !== list.sortOrder;
        });

        // The server moves the setlist to trash as part of the delete (see server/routes/crud.ts).
        Promise.all([
          dataClient.setlists.remove(id),
          ...changed.map((list) => dataClient.setlists.update(list)),
        ]).catch((error) => {
          console.error('Failed to delete setlist.', error);
          setSetlists(prev);
        });
      }
      return nextSetlists;
    });
    setActiveSetlistId((prev) => (prev === id ? null : prev));
  }, [userId]);

  const renameSetlist = useCallback((id: string, name: string) => {
    setSetlists((prev) => {
      const setlist = prev.find((l) => l.id === id);
      if (!setlist) return prev;
      if (!canEditSetlist(setlist, userId)) return prev;

      const nextSetlist = { ...setlist, name, updatedAt: new Date().toISOString() };
      const nextSetlists = prev.map((l) => (l.id === id ? nextSetlist : l));

      if (userId) {
        void dataClient.setlists.update(nextSetlist).catch((error) => {
          console.error('Failed to rename setlist.', error);
          setSetlists(prev);
        });
      }
      return nextSetlists;
    });
  }, [userId]);

  const updateSetlistIcon = useCallback((id: string, icon?: string) => {
    setSetlists((prev) => {
      const setlist = prev.find((l) => l.id === id);
      if (!setlist) return prev;
      if (!canEditSetlist(setlist, userId)) return prev;

      const nextSetlist = { ...setlist, icon, updatedAt: new Date().toISOString() };
      const nextSetlists = prev.map((l) => (l.id === id ? nextSetlist : l));

      if (userId) {
        void dataClient.setlists.update(nextSetlist).catch((error) => {
          console.error('Failed to update setlist icon.', error);
          setSetlists(prev);
        });
      }

      return nextSetlists;
    });
  }, [userId]);

  const addSongToSetlist = useCallback((setlistId: string, songId: string) => {
    setSetlists((prev) => {
      const setlist = prev.find((l) => l.id === setlistId);
      if (!setlist || setlist.songIds.includes(songId)) return prev;
      if (!canEditSetlist(setlist, userId)) return prev;

      const nextSetlist = {
        ...setlist,
        songIds: [...setlist.songIds, songId],
        updatedAt: new Date().toISOString(),
      };
      const nextSetlists = prev.map((l) => (l.id === setlistId ? nextSetlist : l));

      if (userId) {
        void dataClient.setlists.update(nextSetlist).catch((error) => {
          console.error('Failed to add song to setlist.', error);
          setSetlists(prev);
        });
      }
      return nextSetlists;
    });
  }, [userId]);

  const removeSongFromSetlist = useCallback((setlistId: string, songId: string) => {
    setSetlists((prev) => {
      const setlist = prev.find((l) => l.id === setlistId);
      if (!setlist) return prev;
      if (!canEditSetlist(setlist, userId)) return prev;

      const nextSongNotes = { ...(setlist.songNotes ?? {}) };
      delete nextSongNotes[songId];

      const nextSetlist = {
        ...setlist,
        songIds: setlist.songIds.filter((id) => id !== songId),
        songNotes: Object.keys(nextSongNotes).length > 0 ? nextSongNotes : undefined,
        updatedAt: new Date().toISOString(),
      };
      const nextSetlists = prev.map((l) => (l.id === setlistId ? nextSetlist : l));

      if (userId) {
        void dataClient.setlists.update(nextSetlist).catch((error) => {
          console.error('Failed to remove song from setlist.', error);
          setSetlists(prev);
        });
      }
      return nextSetlists;
    });
  }, [userId]);

  const moveSongInSetlist = useCallback((setlistId: string, songId: string, beforeSongId: string | null) => {
    setSetlists((prev) => {
      const setlist = prev.find((l) => l.id === setlistId);
      if (!setlist) return prev;
      if (!canEditSetlist(setlist, userId)) return prev;

      const nextSongIds = moveIdBefore(setlist.songIds, songId, beforeSongId);
      if (nextSongIds === setlist.songIds) return prev;

      const nextSetlist = { ...setlist, songIds: nextSongIds, updatedAt: new Date().toISOString() };
      const nextSetlists = prev.map((l) => (l.id === setlistId ? nextSetlist : l));

      if (userId) {
        void dataClient.setlists.update(nextSetlist).catch((error) => {
          console.error('Failed to reorder setlist songs.', error);
          setSetlists(prev);
        });
      }
      return nextSetlists;
    });
  }, [userId]);

  const updateSongNoteInSetlist = useCallback((setlistId: string, songId: string, note: string) => {
    setSetlists((prev) => {
      const setlist = prev.find((entry) => entry.id === setlistId);
      if (!setlist) return prev;
      if (!canEditSetlist(setlist, userId)) return prev;
      if (!setlist.songIds.includes(songId)) return prev;

      const normalizedNote = note.trim();
      const previousNote = setlist.songNotes?.[songId] ?? '';
      if (normalizedNote === previousNote) return prev;

      const nextSongNotes = { ...(setlist.songNotes ?? {}) };
      if (normalizedNote) {
        nextSongNotes[songId] = normalizedNote;
      } else {
        delete nextSongNotes[songId];
      }

      const nextSetlist: Setlist = {
        ...setlist,
        songNotes: Object.keys(nextSongNotes).length > 0 ? nextSongNotes : undefined,
        updatedAt: new Date().toISOString(),
      };
      const nextSetlists = prev.map((entry) => (entry.id === setlistId ? nextSetlist : entry));

      if (userId) {
        void dataClient.setlists.update(nextSetlist).catch((error) => {
          console.error('Failed to update setlist song note.', error);
          setSetlists(prev);
        });
      }

      return nextSetlists;
    });
  }, [userId]);

  const clearActiveSelection = useCallback(() => {
    setActiveSetlistId(null);
  }, []);

  const value = useMemo(
    () => ({
      setlists,
      activeSetlistId,
      addSetlist,
      deleteSetlist,
      renameSetlist,
      updateSetlistIcon,
      addSongToSetlist,
      removeSongFromSetlist,
      moveSongInSetlist,
      updateSongNoteInSetlist,
      setActiveSetlistId,
      clearActiveSelection,
    }),
    [
      setlists,
      activeSetlistId,
      addSetlist,
      deleteSetlist,
      renameSetlist,
      updateSetlistIcon,
      addSongToSetlist,
      removeSongFromSetlist,
      moveSongInSetlist,
      updateSongNoteInSetlist,
      setActiveSetlistId,
      clearActiveSelection,
    ]
  );

  return (
    <SetlistsContext.Provider value={value}>
      {children}
    </SetlistsContext.Provider>
  );
}

export function useSetlists() {
  const context = useContext(SetlistsContext);
  if (!context) {
    throw new Error('useSetlists must be used within SetlistsProvider');
  }
  return context;
}
