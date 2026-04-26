import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { ReactNode } from 'react';
import { collection, deleteDoc, doc, getDocs, setDoc } from 'firebase/firestore';
import type { Setlist } from '../types';
import { db, firebaseEnabled } from '../lib/firebase';

const KEY_SETLISTS = 'songbook-setlists';
const KEY_ACTIVE_SETLIST = 'songbook-active-setlist';
const SETLISTS_COLLECTION = 'setlists';

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

  const aCreatedAt = a.createdAt ? Date.parse(a.createdAt) : 0;
  const bCreatedAt = b.createdAt ? Date.parse(b.createdAt) : 0;
  return aCreatedAt - bCreatedAt;
}

function normalizeSetlists(setlists: Setlist[]) {
  return [...setlists]
    .sort(compareSetlists)
    .map((setlist, index) => ({ ...setlist, sortOrder: index }));
}

async function writeSetlist(setlist: Setlist) {
  if (!db) return;

  const { id, ...rest } = setlist;
  const firestoreData = Object.fromEntries(Object.entries(rest).filter(([, value]) => value !== undefined));
  await setDoc(doc(db, SETLISTS_COLLECTION, id), firestoreData);
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
  const [setlists, setSetlists] = useState<Setlist[]>(() =>
    firebaseEnabled ? [] : normalizeSetlists(readLocal(KEY_SETLISTS, []))
  );
  const [activeSetlistId, setActiveSetlistId] = useState<string | null>(() =>
    readLocal(KEY_ACTIVE_SETLIST, null)
  );

  useEffect(() => {
    if (!db) {
      return;
    }

    getDocs(collection(db, SETLISTS_COLLECTION))
      .then((snapshot) => {
        setSetlists(normalizeSetlists(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }) as Setlist)));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!firebaseEnabled) {
      writeLocal(KEY_SETLISTS, setlists);
    }
  }, [setlists]);

  useEffect(() => {
    writeLocal(KEY_ACTIVE_SETLIST, activeSetlistId);
  }, [activeSetlistId]);

  const addSetlist = useCallback((name: string) => {
    const nextSetlist: Setlist = {
      id: crypto.randomUUID(),
      name,
      songIds: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setSetlists((prev) => {
      const nextSetlists = normalizeSetlists([
        ...prev,
        nextSetlist,
      ]);
      const createdSetlist = nextSetlists.find((setlist) => setlist.id === nextSetlist.id);

      if (db && createdSetlist) {
        void writeSetlist(createdSetlist).catch(() => {
          setSetlists((rollback) => rollback.filter((setlist) => setlist.id !== nextSetlist.id));
        });
      }

      return nextSetlists;
    });
  }, []);

  const deleteSetlist = useCallback((id: string) => {
    let previousSetlists: Setlist[] = [];
    let nextSetlists: Setlist[] = [];

    setSetlists((prev) => {
      previousSetlists = prev;
      nextSetlists = normalizeSetlists(prev.filter((setlist) => setlist.id !== id));
      return nextSetlists;
    });
    setActiveSetlistId((prev) => (prev === id ? null : prev));

    if (!db) {
      return;
    }

    const changedSetlists = nextSetlists.filter((setlist, index) => {
      const previousSetlist = previousSetlists[index];
      return previousSetlist?.id !== setlist.id || previousSetlist?.sortOrder !== setlist.sortOrder;
    });

    Promise.all([
      deleteDoc(doc(db, SETLISTS_COLLECTION, id)),
      ...changedSetlists.map((setlist) => writeSetlist(setlist)),
    ]).catch(() => {
      setSetlists(previousSetlists);
    });
  }, []);

  const renameSetlist = useCallback((id: string, name: string) => {
    let previousSetlist: Setlist | undefined;
    let nextSetlist: Setlist | undefined;

    setSetlists((prev) =>
      prev.map((setlist) => {
        if (setlist.id !== id) {
          return setlist;
        }

        previousSetlist = setlist;
        nextSetlist = { ...setlist, name, updatedAt: new Date().toISOString() };
        return nextSetlist;
      })
    );

    if (!db || !previousSetlist || !nextSetlist) {
      return;
    }

    void writeSetlist(nextSetlist).catch(() => {
      setSetlists((prev) => prev.map((setlist) => (setlist.id === id ? previousSetlist as Setlist : setlist)));
    });
  }, []);

  const addSongToSetlist = useCallback((setlistId: string, songId: string) => {
    let previousSetlist: Setlist | undefined;
    let nextSetlist: Setlist | undefined;

    setSetlists((prev) =>
      prev.map((setlist) => {
        if (setlist.id !== setlistId || setlist.songIds.includes(songId)) {
          return setlist;
        }

        previousSetlist = setlist;
        nextSetlist = {
          ...setlist,
          songIds: [...setlist.songIds, songId],
          updatedAt: new Date().toISOString(),
        };
        return nextSetlist;
      })
    );

    if (!db || !previousSetlist || !nextSetlist) {
      return;
    }

    void writeSetlist(nextSetlist).catch(() => {
      setSetlists((prev) => prev.map((setlist) => (setlist.id === setlistId ? previousSetlist as Setlist : setlist)));
    });
  }, []);

  const removeSongFromSetlist = useCallback((setlistId: string, songId: string) => {
    let previousSetlist: Setlist | undefined;
    let nextSetlist: Setlist | undefined;

    setSetlists((prev) =>
      prev.map((setlist) => {
        if (setlist.id !== setlistId) {
          return setlist;
        }

        previousSetlist = setlist;
        nextSetlist = {
          ...setlist,
          songIds: setlist.songIds.filter((id) => id !== songId),
          updatedAt: new Date().toISOString(),
        };
        return nextSetlist;
      })
    );

    if (!db || !previousSetlist || !nextSetlist) {
      return;
    }

    void writeSetlist(nextSetlist).catch(() => {
      setSetlists((prev) => prev.map((setlist) => (setlist.id === setlistId ? previousSetlist as Setlist : setlist)));
    });
  }, []);

  const moveSongInSetlist = useCallback((setlistId: string, songId: string, beforeSongId: string | null) => {
    let previousSetlist: Setlist | undefined;
    let nextSetlist: Setlist | undefined;

    setSetlists((prev) =>
      prev.map((setlist) => {
        if (setlist.id !== setlistId) {
          return setlist;
        }

        const nextSongIds = moveSongId(setlist.songIds, songId, beforeSongId);
        if (nextSongIds === setlist.songIds) {
          return setlist;
        }

        previousSetlist = setlist;
        nextSetlist = { ...setlist, songIds: nextSongIds, updatedAt: new Date().toISOString() };
        return nextSetlist;
      })
    );

    if (!db || !previousSetlist || !nextSetlist) {
      return;
    }

    void writeSetlist(nextSetlist).catch(() => {
      setSetlists((prev) => prev.map((setlist) => (setlist.id === setlistId ? previousSetlist as Setlist : setlist)));
    });
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
