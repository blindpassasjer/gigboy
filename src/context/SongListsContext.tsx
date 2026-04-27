import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { ReactNode } from 'react';
import { collection, deleteDoc, doc, getDocs, setDoc } from 'firebase/firestore';
import type { SongList, SongListCategory } from '../types';
import { db, firebaseEnabled } from '../lib/firebase';

const KEY_FOLDERS = 'folio-folders';
const KEY_LISTS = 'folio-song-lists';
const CATEGORIES_COLLECTION = 'songListCategories';
const LISTS_COLLECTION = 'songLists';

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

function compareBySortOrder<T extends { sortOrder?: number; name: string }>(a: T, b: T) {
  const aSortOrder = typeof a.sortOrder === 'number' ? a.sortOrder : Number.MAX_SAFE_INTEGER;
  const bSortOrder = typeof b.sortOrder === 'number' ? b.sortOrder : Number.MAX_SAFE_INTEGER;

  if (aSortOrder !== bSortOrder) {
    return aSortOrder - bSortOrder;
  }

  return a.name.localeCompare(b.name);
}

function withSequentialSortOrder<T extends { sortOrder?: number }>(entries: T[]): T[] {
  return entries.map((entry, index) => ({ ...entry, sortOrder: index }));
}

function ensureSongListsCategory(categories: SongListCategory[]) {
  const normalized = withSequentialSortOrder([...categories].sort(compareBySortOrder));
  const existingIndex = normalized.findIndex((category) => category.id === SONGLISTS_CATEGORY_ID);

  if (existingIndex >= 0) {
    const nextCategories = [...normalized];
    nextCategories[existingIndex] = {
      ...nextCategories[existingIndex],
      name: 'songlists',
    };
    return withSequentialSortOrder(nextCategories);
  }

  return withSequentialSortOrder([
    ...normalized,
    { id: SONGLISTS_CATEGORY_ID, name: 'songlists' } as SongListCategory,
  ]);
}

function normalizeSongLists(songLists: SongList[]) {
  return withSequentialSortOrder([...songLists].sort(compareBySortOrder));
}

async function writeCategory(category: SongListCategory) {
  if (!db) return;

  const { id, ...rest } = category;
  const firestoreData = Object.fromEntries(Object.entries(rest).filter(([, value]) => value !== undefined));
  await setDoc(doc(db, CATEGORIES_COLLECTION, id), firestoreData);
}

async function writeSongList(songList: SongList) {
  if (!db) return;

  const { id, ...rest } = songList;
  const firestoreData = Object.fromEntries(Object.entries(rest).filter(([, value]) => value !== undefined));
  await setDoc(doc(db, LISTS_COLLECTION, id), firestoreData);
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

interface SongListsContextValue {
  categories: SongListCategory[];
  songLists: SongList[];
  activeCategoryId: string | null;
  activeSongListId: string | null;
  addCategory: (name: string) => void;
  deleteCategory: (id: string) => void;
  addSongList: (name: string, folderId?: string) => void;
  deleteSongList: (id: string) => void;
  addSongToList: (listId: string, songId: string) => void;
  removeSongFromList: (listId: string, songId: string) => void;
  moveSongInList: (listId: string, songId: string, beforeSongId: string | null) => void;
  moveSongList: (listId: string, targetCategoryId?: string, beforeListId?: string | null) => void;
  setActiveCategoryId: (id: string | null) => void;
  setActiveSongListId: (id: string | null) => void;
  clearActiveSelection: () => void;
}

const SongListsContext = createContext<SongListsContextValue | null>(null);

const SONGLISTS_CATEGORY_ID = 'songlists-default';

export function SongListsProvider({ children }: { children: ReactNode }) {
  const [categories, setCategories] = useState<SongListCategory[]>(() =>
    firebaseEnabled ? [] : ensureSongListsCategory(readLocal<SongListCategory[]>(KEY_FOLDERS, []))
  );
  const [songLists, setSongLists] = useState<SongList[]>(() =>
    firebaseEnabled ? [] : normalizeSongLists(readLocal<SongList[]>(KEY_LISTS, []))
  );
  const [activeCategoryId, setActiveCategoryState] = useState<string | null>(null);
  const [activeSongListId, setActiveSongListId] = useState<string | null>(null);

  useEffect(() => {
    if (!db) return;

    Promise.all([
      getDocs(collection(db, CATEGORIES_COLLECTION)),
      getDocs(collection(db, LISTS_COLLECTION)),
    ])
      .then(([categorySnapshot, listSnapshot]) => {
        const fetchedCategories = categorySnapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }) as SongListCategory);
        const nextCategories = ensureSongListsCategory(fetchedCategories);
        const nextLists = normalizeSongLists(
          listSnapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }) as SongList)
        );

        setCategories(nextCategories);
        setSongLists(nextLists);

        // Persist default category if it doesn't exist in Firestore
        if (nextCategories.length > fetchedCategories.length) {
          const defaultCat = nextCategories.find(c => c.id === SONGLISTS_CATEGORY_ID);
          if (defaultCat) void writeCategory(defaultCat);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!firebaseEnabled) {
      writeLocal(KEY_FOLDERS, categories);
      writeLocal(KEY_LISTS, songLists);
    }
  }, [categories, songLists]);

  const addCategory = useCallback((name: string) => {
    const id = crypto.randomUUID();
    const nextCategory: SongListCategory = { id, name };

    setCategories((prev) => {
      const nextCategories = withSequentialSortOrder([...prev, nextCategory]);
      if (db) {
        const saved = nextCategories.find(c => c.id === id);
        if (saved) void writeCategory(saved).catch(() => setCategories(prev));
      }
      return nextCategories;
    });
  }, []);

  const deleteCategory = useCallback((id: string) => {
    if (id === SONGLISTS_CATEGORY_ID) return;

    setCategories((prevCategories) => {
      const nextCategories = withSequentialSortOrder(prevCategories.filter((c) => c.id !== id));
      
      setSongLists((prevLists) => {
        const nextLists = normalizeSongLists(
          prevLists.map((list) => (list.folderId === id ? { ...list, folderId: undefined } : list))
        );

        if (db) {
          const changedLists = nextLists.filter((list) => {
            const prev = prevLists.find((p) => p.id === list.id);
            return prev && (prev.folderId !== list.folderId || prev.sortOrder !== list.sortOrder);
          });

          Promise.all([
            deleteDoc(doc(db, CATEGORIES_COLLECTION, id)),
            ...nextCategories.map((cat) => writeCategory(cat)),
            ...changedLists.map((list) => writeSongList(list)),
          ]).catch(() => {
            setCategories(prevCategories);
            setSongLists(prevLists);
          });
        }
        return nextLists;
      });

      return nextCategories;
    });
    
    setActiveCategoryState((prev) => (prev === id ? null : prev));
  }, []);

  const addSongList = useCallback((name: string, folderId?: string) => {
    const id = crypto.randomUUID();
    const nextSongList: SongList = { id, name, songIds: [], folderId };

    setSongLists((prev) => {
      const nextLists = normalizeSongLists([...prev, nextSongList]);
      if (db) {
        const changed = nextLists.filter((list) => {
          const p = prev.find((item) => item.id === list.id);
          return !p || p.sortOrder !== list.sortOrder;
        });
        Promise.all(changed.map((list) => writeSongList(list))).catch(() => setSongLists(prev));
      }
      return nextLists;
    });
  }, []);

  const deleteSongList = useCallback((id: string) => {
    setSongLists((prev) => {
      const nextLists = normalizeSongLists(prev.filter((list) => list.id !== id));
      if (db) {
        const changed = nextLists.filter((list) => {
          const p = prev.find((item) => item.id === list.id);
          return p && p.sortOrder !== list.sortOrder;
        });

        Promise.all([
          deleteDoc(doc(db, LISTS_COLLECTION, id)),
          ...changed.map((list) => writeSongList(list)),
        ]).catch(() => setSongLists(prev));
      }
      return nextLists;
    });
    setActiveSongListId((prev) => (prev === id ? null : prev));
  }, []);

  const setActiveCategoryId = useCallback((id: string | null) => {
    setActiveCategoryState(id);
    setActiveSongListId(null);
  }, []);

  const setActiveListId = useCallback((id: string | null) => {
    setActiveSongListId(id);
    setActiveCategoryState(null);
  }, []);

  const clearActiveSelection = useCallback(() => {
    setActiveCategoryState(null);
    setActiveSongListId(null);
  }, []);

  const addSongToList = useCallback((listId: string, songId: string) => {
    setSongLists((prev) => {
      const list = prev.find((l) => l.id === listId);
      if (!list || list.songIds.includes(songId)) return prev;

      const nextList = { ...list, songIds: [...list.songIds, songId] };
      const nextLists = prev.map((l) => (l.id === listId ? nextList : l));

      if (db) {
        void writeSongList(nextList).catch(() => setSongLists(prev));
      }
      return nextLists;
    });
  }, []);

  const removeSongFromList = useCallback((listId: string, songId: string) => {
    setSongLists((prev) => {
      const list = prev.find((l) => l.id === listId);
      if (!list) return prev;

      const nextList = { ...list, songIds: list.songIds.filter((id) => id !== songId) };
      const nextLists = prev.map((l) => (l.id === listId ? nextList : l));

      if (db) {
        void writeSongList(nextList).catch(() => setSongLists(prev));
      }
      return nextLists;
    });
  }, []);

  const moveSongInList = useCallback((listId: string, songId: string, beforeSongId: string | null) => {
    setSongLists((prev) => {
      const list = prev.find((l) => l.id === listId);
      if (!list) return prev;

      const nextSongIds = moveSongId(list.songIds, songId, beforeSongId);
      if (nextSongIds === list.songIds) return prev;

      const nextList = { ...list, songIds: nextSongIds };
      const nextLists = prev.map((l) => (l.id === listId ? nextList : l));

      if (db) {
        void writeSongList(nextList).catch(() => setSongLists(prev));
      }
      return nextLists;
    });
  }, []);

  const moveSongList = useCallback((listId: string, targetCategoryId?: string, beforeListId?: string | null) => {
    setSongLists((prev) => {
      const moving = prev.find((l) => l.id === listId);
      if (!moving) return prev;

      const withoutMoving = prev.filter((l) => l.id !== listId);
      const moved: SongList = { ...moving, folderId: targetCategoryId };

      let nextLists: SongList[];
      if (beforeListId) {
        const beforeIndex = withoutMoving.findIndex((l) => l.id === beforeListId);
        nextLists = normalizeSongLists(
          beforeIndex >= 0
            ? [...withoutMoving.slice(0, beforeIndex), moved, ...withoutMoving.slice(beforeIndex)]
            : [...withoutMoving, moved]
        );
      } else {
        const targetIndex = withoutMoving.findLastIndex((l) => l.folderId === targetCategoryId);
        nextLists = normalizeSongLists(
          targetIndex >= 0
            ? [...withoutMoving.slice(0, targetIndex + 1), moved, ...withoutMoving.slice(targetIndex + 1)]
            : [...withoutMoving, moved]
        );
      }

      if (db) {
        const changed = nextLists.filter((list) => {
          const p = prev.find((item) => item.id === list.id);
          return !p || p.sortOrder !== list.sortOrder || p.folderId !== list.folderId;
        });
        Promise.all(changed.map((list) => writeSongList(list))).catch(() => setSongLists(prev));
      }
      return nextLists;
    });
  }, []);

  return (
    <SongListsContext.Provider
      value={{
        categories,
        songLists,
        activeCategoryId,
        activeSongListId,
        addCategory,
        deleteCategory,
        addSongList,
        deleteSongList,
        addSongToList,
        removeSongFromList,
        moveSongInList,
        moveSongList,
        setActiveCategoryId,
        setActiveSongListId: setActiveListId,
        clearActiveSelection,
      }}
    >
      {children}
    </SongListsContext.Provider>
  );
}

export function useSongLists() {
  const ctx = useContext(SongListsContext);
  if (!ctx) throw new Error('useSongLists must be used inside SongListsProvider');
  return ctx;
}
