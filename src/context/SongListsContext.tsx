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
    if (!db) {
      return;
    }

    Promise.all([
      getDocs(collection(db, CATEGORIES_COLLECTION)),
      getDocs(collection(db, LISTS_COLLECTION)),
    ])
      .then(([categorySnapshot, listSnapshot]) => {
        const nextCategories = ensureSongListsCategory(
          categorySnapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }) as SongListCategory)
        );
        const nextLists = normalizeSongLists(
          listSnapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }) as SongList)
        );

        setCategories(nextCategories);
        setSongLists(nextLists);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!firebaseEnabled) {
      writeLocal(KEY_FOLDERS, categories);
    }
  }, [categories]);

  useEffect(() => {
    if (!firebaseEnabled) {
      writeLocal(KEY_LISTS, songLists);
    }
  }, [songLists]);

  const addCategory = useCallback((name: string) => {
    const nextCategory: SongListCategory = { id: crypto.randomUUID(), name };

    setCategories((prev) => {
      const nextCategories = withSequentialSortOrder([...prev, nextCategory]);
      const createdCategory = nextCategories[nextCategories.length - 1];
      if (db && createdCategory) {
        void writeCategory(createdCategory).catch(() => {
          setCategories((rollback) => rollback.filter((category) => category.id !== nextCategory.id));
        });
      }
      return nextCategories;
    });
  }, []);

  const deleteCategory = useCallback((id: string) => {
    // Prevent deletion of the default "songlists" category
    if (id === SONGLISTS_CATEGORY_ID) return;

    let previousCategories: SongListCategory[] = [];
    let nextCategories: SongListCategory[] = [];
    let previousLists: SongList[] = [];
    let nextLists: SongList[] = [];

    setCategories((prev) => {
      previousCategories = prev;
      nextCategories = withSequentialSortOrder(prev.filter((category) => category.id !== id));
      return nextCategories;
    });
    setSongLists((prev) => {
      previousLists = prev;
      nextLists = normalizeSongLists(
        prev.map((list) => (list.folderId === id ? { ...list, folderId: undefined } : list))
      );
      return nextLists;
    });
    setActiveCategoryState((prev) => (prev === id ? null : prev));

    if (!db) {
      return;
    }

    Promise.all([
      deleteDoc(doc(db, CATEGORIES_COLLECTION, id)),
      ...nextCategories.map((category) => writeCategory(category)),
      ...nextLists
        .filter((list) => {
          const previousList = previousLists.find((entry) => entry.id === list.id);
          return previousList?.folderId !== list.folderId || previousList?.sortOrder !== list.sortOrder;
        })
        .map((list) => writeSongList(list)),
    ]).catch(() => {
      setCategories(previousCategories);
      setSongLists(previousLists);
    });
  }, []);

  const addSongList = useCallback((name: string, folderId?: string) => {
    const nextSongList: SongList = { id: crypto.randomUUID(), name, songIds: [], folderId };

    setSongLists((prev) => {
      const nextLists = normalizeSongLists([...prev, nextSongList]);
      const createdList = nextLists.find((list) => list.id === nextSongList.id);

      if (db && createdList) {
        void writeSongList(createdList).catch(() => {
          setSongLists((rollback) => rollback.filter((list) => list.id !== nextSongList.id));
        });
      }

      return nextLists;
    });
  }, []);

  const deleteSongList = useCallback((id: string) => {
    let previousLists: SongList[] = [];
    let nextLists: SongList[] = [];

    setSongLists((prev) => {
      previousLists = prev;
      nextLists = normalizeSongLists(prev.filter((list) => list.id !== id));
      return nextLists;
    });
    setActiveSongListId((prev) => (prev === id ? null : prev));

    if (!db) {
      return;
    }

    Promise.all([
      deleteDoc(doc(db, LISTS_COLLECTION, id)),
      ...nextLists.filter((list, index) => previousLists[index]?.id !== list.id || previousLists[index]?.sortOrder !== list.sortOrder).map((list) => writeSongList(list)),
    ]).catch(() => {
      setSongLists(previousLists);
    });
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
    let previousList: SongList | undefined;
    let nextList: SongList | undefined;

    setSongLists((prev) =>
      prev.map((list) => {
        if (list.id !== listId || list.songIds.includes(songId)) {
          return list;
        }

        previousList = list;
        nextList = { ...list, songIds: [...list.songIds, songId] };
        return nextList;
      })
    );

    if (!db || !nextList || !previousList) {
      return;
    }

    void writeSongList(nextList).catch(() => {
      setSongLists((prev) => prev.map((list) => (list.id === listId ? previousList as SongList : list)));
    });
  }, []);

  const removeSongFromList = useCallback((listId: string, songId: string) => {
    let previousList: SongList | undefined;
    let nextList: SongList | undefined;

    setSongLists((prev) =>
      prev.map((list) => {
        if (list.id !== listId) {
          return list;
        }

        previousList = list;
        nextList = { ...list, songIds: list.songIds.filter((id) => id !== songId) };
        return nextList;
      })
    );

    if (!db || !nextList || !previousList) {
      return;
    }

    void writeSongList(nextList).catch(() => {
      setSongLists((prev) => prev.map((list) => (list.id === listId ? previousList as SongList : list)));
    });
  }, []);

  const moveSongInList = useCallback((listId: string, songId: string, beforeSongId: string | null) => {
    let previousList: SongList | undefined;
    let nextList: SongList | undefined;

    setSongLists((prev) =>
      prev.map((list) => {
        if (list.id !== listId) {
          return list;
        }

        const nextSongIds = moveSongId(list.songIds, songId, beforeSongId);
        if (nextSongIds === list.songIds) {
          return list;
        }

        previousList = list;
        nextList = { ...list, songIds: nextSongIds };
        return nextList;
      })
    );

    if (!db || !nextList || !previousList) {
      return;
    }

    void writeSongList(nextList).catch(() => {
      setSongLists((prev) => prev.map((list) => (list.id === listId ? previousList as SongList : list)));
    });
  }, []);

  const moveSongList = useCallback((listId: string, targetCategoryId?: string, beforeListId?: string | null) => {
    let previousLists: SongList[] = [];
    let nextLists: SongList[] = [];

    setSongLists((prev) => {
      previousLists = prev;
      const moving = prev.find((l) => l.id === listId);
      if (!moving) return prev;

      const normalizedTarget = targetCategoryId;
      const withoutMoving = prev.filter((l) => l.id !== listId);
      const moved: SongList = { ...moving, folderId: normalizedTarget };

      if (beforeListId) {
        const beforeIndex = withoutMoving.findIndex((l) => l.id === beforeListId);
        if (beforeIndex >= 0) {
          nextLists = normalizeSongLists([
            ...withoutMoving.slice(0, beforeIndex),
            moved,
            ...withoutMoving.slice(beforeIndex),
          ]);
          return nextLists;
        }
      }

      for (let i = withoutMoving.length - 1; i >= 0; i -= 1) {
        if (withoutMoving[i].folderId === normalizedTarget) {
          nextLists = normalizeSongLists([
            ...withoutMoving.slice(0, i + 1),
            moved,
            ...withoutMoving.slice(i + 1),
          ]);
          return nextLists;
        }
      }

      nextLists = normalizeSongLists([...withoutMoving, moved]);
      return nextLists;
    });

    if (!db || nextLists === previousLists) {
      return;
    }

    const changedLists = nextLists.filter((list, index) => {
      const previousList = previousLists[index];
      return previousList?.id !== list.id || previousList?.sortOrder !== list.sortOrder || previousList?.folderId !== list.folderId;
    });

    if (changedLists.length === 0) {
      return;
    }

    Promise.all(changedLists.map((list) => writeSongList(list))).catch(() => {
      setSongLists(previousLists);
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
