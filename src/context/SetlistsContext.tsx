import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { ReactNode } from 'react';
import { collection, deleteDoc, doc, getDocs, setDoc } from 'firebase/firestore';
import type { Setlist } from '../types';
import { db } from '../lib/firebase';
import { useAuth } from './AuthContext';

const KEY_SETLISTS = 'songbook-setlists';
const KEY_ACTIVE_SETLIST = 'songbook-active-setlist';
const SETLISTS_COLLECTION = 'setlists';

function isPermissionDeniedError(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const maybeCode = (error as { code?: unknown }).code;
  return maybeCode === 'permission-denied';
}

function logSetlistsPermissionHelp(error: unknown) {
  console.warn(
    'Firestore denied access to users/{uid}/setlists. Setlists will stay local until Firestore rules allow this path.',
    error
  );
}

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

async function writeSetlist(setlist: Setlist, userId: string | null) {
  if (!db || !userId) return;

  const { id, ...rest } = setlist;
  const firestoreData = Object.fromEntries(Object.entries(rest).filter(([, value]) => value !== undefined));
  await setDoc(doc(db, 'users', userId, SETLISTS_COLLECTION, id), firestoreData);
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
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [setlists, setSetlists] = useState<Setlist[]>(() =>
    normalizeSetlists(readLocal(KEY_SETLISTS, []))
  );
  const [activeSetlistId, setActiveSetlistId] = useState<string | null>(() =>
    readLocal(KEY_ACTIVE_SETLIST, null)
  );

  useEffect(() => {
    if (!db || !userId) {
      return;
    }

    getDocs(collection(db, 'users', userId, SETLISTS_COLLECTION))
      .then((snapshot) => {
        setSetlists(normalizeSetlists(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }) as Setlist)));
      })
      .catch((error) => {
        if (isPermissionDeniedError(error)) {
          logSetlistsPermissionHelp(error);
          return;
        }

        console.error('Failed to load setlists from Firestore. Falling back to local data.', error);
      });
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
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setSetlists((prev) => {
      const nextSetlists = normalizeSetlists([...prev, nextSetlist]);
      if (db && userId) {
        const changed = nextSetlists.filter((list) => {
          const p = prev.find((item) => item.id === list.id);
          return !p || p.sortOrder !== list.sortOrder;
        });
        Promise.all(changed.map((list) => writeSetlist(list, userId))).catch((error) => {
          if (isPermissionDeniedError(error)) {
            logSetlistsPermissionHelp(error);
          } else {
            console.error('Failed to save setlists to Firestore.', error);
          }
          setSetlists(prev);
        });
      }
      return nextSetlists;
    });
  }, [userId]);

  const deleteSetlist = useCallback((id: string) => {
    setSetlists((prev) => {
      const nextSetlists = normalizeSetlists(prev.filter((list) => list.id !== id));
      if (db && userId) {
        const changed = nextSetlists.filter((list) => {
          const p = prev.find((item) => item.id === list.id);
          return p && p.sortOrder !== list.sortOrder;
        });

        Promise.all([
          deleteDoc(doc(db, 'users', userId, SETLISTS_COLLECTION, id)),
          ...changed.map((list) => writeSetlist(list, userId)),
        ]).catch((error) => {
          if (isPermissionDeniedError(error)) {
            logSetlistsPermissionHelp(error);
          } else {
            console.error('Failed to delete setlist in Firestore.', error);
          }
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

      const nextSetlist = { ...setlist, name, updatedAt: new Date().toISOString() };
      const nextSetlists = prev.map((l) => (l.id === id ? nextSetlist : l));

      if (db && userId) {
        void writeSetlist(nextSetlist, userId).catch((error) => {
          if (isPermissionDeniedError(error)) {
            logSetlistsPermissionHelp(error);
          } else {
            console.error('Failed to rename setlist in Firestore.', error);
          }
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

      const nextSetlist = {
        ...setlist,
        songIds: [...setlist.songIds, songId],
        updatedAt: new Date().toISOString(),
      };
      const nextSetlists = prev.map((l) => (l.id === setlistId ? nextSetlist : l));

      if (db && userId) {
        void writeSetlist(nextSetlist, userId).catch((error) => {
          if (isPermissionDeniedError(error)) {
            logSetlistsPermissionHelp(error);
          } else {
            console.error('Failed to add song to setlist in Firestore.', error);
          }
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

      const nextSetlist = {
        ...setlist,
        songIds: setlist.songIds.filter((id) => id !== songId),
        updatedAt: new Date().toISOString(),
      };
      const nextSetlists = prev.map((l) => (l.id === setlistId ? nextSetlist : l));

      if (db && userId) {
        void writeSetlist(nextSetlist, userId).catch((error) => {
          if (isPermissionDeniedError(error)) {
            logSetlistsPermissionHelp(error);
          } else {
            console.error('Failed to remove song from setlist in Firestore.', error);
          }
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

      const nextSongIds = moveSongId(setlist.songIds, songId, beforeSongId);
      if (nextSongIds === setlist.songIds) return prev;

      const nextSetlist = { ...setlist, songIds: nextSongIds, updatedAt: new Date().toISOString() };
      const nextSetlists = prev.map((l) => (l.id === setlistId ? nextSetlist : l));

      if (db && userId) {
        void writeSetlist(nextSetlist, userId).catch((error) => {
          if (isPermissionDeniedError(error)) {
            logSetlistsPermissionHelp(error);
          } else {
            console.error('Failed to reorder setlist songs in Firestore.', error);
          }
          setSetlists(prev);
        });
      }
      return nextSetlists;
    });
  }, [userId]);

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
