import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { ReactNode } from 'react';
import type { Setlist } from '../types';

const KEY_SETLISTS = 'songbook-setlists';
const KEY_ACTIVE_SETLIST = 'songbook-active-setlist';

function readLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function moveSongId(songIds: string[], songId: string, beforeSongId: string | null) {
  const currentIndex = songIds.indexOf(songId);
  if (currentIndex < 0) return songIds;

  const nextSongIds = [...songIds];
  nextSongIds.splice(currentIndex, 1);

  if (beforeSongId === null) {
    nextSongIds.push(songId);
    return nextSongIds;
  }

  const targetIndex = nextSongIds.indexOf(beforeSongId);
  if (targetIndex < 0) return songIds;

  nextSongIds.splice(targetIndex, 0, songId);
  return nextSongIds;
}

interface SetlistsContextValue {
  setlists: Setlist[];
  activeSetlistId: string | null;
  addSetlist: (name: string) => void;
  deleteSetlist: (id: string) => void;
  renameSetlist: (id: string, name: string) => void;
  addSongToSetlist: (setlistId: string, songId: string) => void;
  removeSongFromSetlist: (setlistId: string, songId: string) => void;
  moveSongInSetlist: (setlistId: string, songId: string, beforeSongId: string | null) => void;
  setActiveSetlistId: (id: string | null) => void;
  clearActiveSelection: () => void;
}

const SetlistsContext = createContext<SetlistsContextValue | null>(null);

export function SetlistsProvider({ children }: { children: ReactNode }) {
  const [setlists, setSetlists] = useState<Setlist[]>(() => readLocal(KEY_SETLISTS, []));
  const [activeSetlistId, setActiveSetlistId] = useState<string | null>(() =>
    readLocal(KEY_ACTIVE_SETLIST, null)
  );

  useEffect(() => {
    localStorage.setItem(KEY_SETLISTS, JSON.stringify(setlists));
  }, [setlists]);

  useEffect(() => {
    localStorage.setItem(KEY_ACTIVE_SETLIST, JSON.stringify(activeSetlistId));
  }, [activeSetlistId]);

  const addSetlist = useCallback((name: string) => {
    setSetlists((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        name,
        songIds: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);
  }, []);

  const deleteSetlist = useCallback((id: string) => {
    setSetlists((prev) => prev.filter((s) => s.id !== id));
    setActiveSetlistId((prev) => (prev === id ? null : prev));
  }, []);

  const renameSetlist = useCallback((id: string, name: string) => {
    setSetlists((prev) =>
      prev.map((s) =>
        s.id === id ? { ...s, name, updatedAt: new Date().toISOString() } : s
      )
    );
  }, []);

  const addSongToSetlist = useCallback((setlistId: string, songId: string) => {
    setSetlists((prev) =>
      prev.map((s) =>
        s.id === setlistId && !s.songIds.includes(songId)
          ? { ...s, songIds: [...s.songIds, songId], updatedAt: new Date().toISOString() }
          : s
      )
    );
  }, []);

  const removeSongFromSetlist = useCallback((setlistId: string, songId: string) => {
    setSetlists((prev) =>
      prev.map((s) =>
        s.id === setlistId
          ? { ...s, songIds: s.songIds.filter((id) => id !== songId), updatedAt: new Date().toISOString() }
          : s
      )
    );
  }, []);

  const moveSongInSetlist = useCallback((setlistId: string, songId: string, beforeSongId: string | null) => {
    setSetlists((prev) =>
      prev.map((setlist) => {
        if (setlist.id !== setlistId) {
          return setlist;
        }

        const nextSongIds = moveSongId(setlist.songIds, songId, beforeSongId);
        return nextSongIds === setlist.songIds
          ? setlist
          : { ...setlist, songIds: nextSongIds, updatedAt: new Date().toISOString() };
      })
    );
  }, []);

  const clearActiveSelection = useCallback(() => {
    setActiveSetlistId(null);
  }, []);

  return (
    <SetlistsContext.Provider
      value={{
        setlists,
        activeSetlistId,
        addSetlist,
        deleteSetlist,
        renameSetlist,
        addSongToSetlist,
        removeSongFromSetlist,
        moveSongInSetlist,
        setActiveSetlistId,
        clearActiveSelection,
      }}
    >
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
