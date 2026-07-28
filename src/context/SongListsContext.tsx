/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { ReactNode } from 'react';
import { collection, deleteDoc, doc, getDocs, setDoc } from 'firebase/firestore';
import type { SongList, SongListCategory, TrashedSongList } from '../types';
import { loadAcceptedSharedResources } from '../lib/collaboration';
import { db } from '../lib/firebase';
import {
  compareTrashByDeletedAtDesc,
  createTrashPayload,
  createTrashTimestamps,
  isTrashExpired,
  parseSongListTrashRecord,
  TRASH_COLLECTION,
} from '../lib/trash';
import { useAuth } from './AuthContext';
import { moveIdBefore } from '../utils/arrayUtils';

const KEY_FOLDERS = 'gigboy-folders';
const KEY_LISTS = 'gigboy-song-lists';
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

async function writeCategory(category: SongListCategory, userId: string | null) {
  if (!db || !userId) return;

  const { id, ...rest } = category;
  const firestoreData = Object.fromEntries(Object.entries(rest).filter(([, value]) => value !== undefined));
  await setDoc(doc(db, 'users', userId, CATEGORIES_COLLECTION, id), firestoreData);
}

async function writeSongList(songList: SongList, userId: string | null) {
  if (!db || !userId) return;

  const targetOwnerId = songList.ownerId ?? userId;

  const { id, ...rest } = songList;
  const firestoreData = Object.fromEntries(Object.entries(rest).filter(([, value]) => value !== undefined));
  await setDoc(doc(db, 'users', targetOwnerId, LISTS_COLLECTION, id), firestoreData);
}

function roleForSongList(songList: SongList, userId: string | null): SongList['accessRole'] {
  if (!userId) return undefined;
  if (songList.ownerId === userId) return 'owner';
  const permission = songList.collaborationPermissions?.[userId];
  if (permission === 'viewer' || permission === 'editor') return permission;
  return undefined;
}

function canEditSongList(songList: SongList, userId: string | null) {
  const role = roleForSongList(songList, userId);
  return role === 'owner' || role === 'editor';
}

function isSongListOwner(songList: SongList, userId: string | null) {
  const ownerId = songList.ownerId ?? userId;
  return Boolean(userId && ownerId === userId);
}

function songListFromDoc(id: string, data: Record<string, unknown>, ownerId: string, currentUserId: string): SongList {
  const songList = { id, ownerId, ...(data as Omit<SongList, 'id'>) } as SongList;
  return { ...songList, accessRole: roleForSongList(songList, currentUserId) };
}

function findLastIndexByFolderId(songLists: SongList[], folderId: string | undefined) {
  for (let index = songLists.length - 1; index >= 0; index -= 1) {
    if (songLists[index]?.folderId === folderId) {
      return index;
    }
  }

  return -1;
}

interface SongListsContextValue {
  categories: SongListCategory[];
  songLists: SongList[];
  trashedSongLists: TrashedSongList[];
  activeCategoryId: string | null;
  activeSongListId: string | null;
  addCategory: (name: string) => void;
  deleteCategory: (id: string) => void;
  addSongList: (name: string, folderId?: string) => void;
  deleteSongList: (id: string) => void;
  restoreSongListFromTrash: (trashId: string) => Promise<string | null>;
  deleteSongListPermanently: (trashId: string) => Promise<string | null>;
  renameSongList: (id: string, name: string) => void;
  addSongToList: (listId: string, songId: string) => void;
  removeSongFromList: (listId: string, songId: string) => void;
  moveSongInList: (listId: string, songId: string, beforeSongId: string | null) => void;
  updateSongListAppearance: (listId: string, appearance: { icon?: string }) => void;
  moveSongList: (listId: string, targetCategoryId?: string, beforeListId?: string | null) => void;
  setActiveCategoryId: (id: string | null) => void;
  setActiveSongListId: (id: string | null) => void;
  clearActiveSelection: () => void;
}

const SongListsContext = createContext<SongListsContextValue | null>(null);

const SONGLISTS_CATEGORY_ID = 'songlists-default';

export function SongListsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [categories, setCategories] = useState<SongListCategory[]>(() =>
    ensureSongListsCategory(readLocal<SongListCategory[]>(KEY_FOLDERS, []))
  );
  const [songLists, setSongLists] = useState<SongList[]>(() =>
    normalizeSongLists(readLocal<SongList[]>(KEY_LISTS, []))
  );
  const [trashedSongLists, setTrashedSongLists] = useState<TrashedSongList[]>([]);
  const [activeCategoryId, setActiveCategoryState] = useState<string | null>(null);
  const [activeSongListId, setActiveSongListId] = useState<string | null>(null);

  useEffect(() => {
    if (!db || !userId) {
      setTrashedSongLists([]);
      return;
    }

    const firestore = db;

    Promise.allSettled([
      getDocs(collection(firestore, 'users', userId, CATEGORIES_COLLECTION)),
      getDocs(collection(firestore, 'users', userId, LISTS_COLLECTION)),
      loadAcceptedSharedResources({
        db: firestore,
        userId,
        resourceType: 'songlist',
        mapResource: (invite, id, data) => songListFromDoc(id, data, invite.ownerId, userId),
      }),
      getDocs(collection(firestore, 'users', userId, TRASH_COLLECTION)),
    ])
      .then(([categoryResult, listResult, sharedResult, trashResult]) => {
        const categorySnapshot = categoryResult.status === 'fulfilled' ? categoryResult.value : null;
        const listSnapshot = listResult.status === 'fulfilled' ? listResult.value : null;
        const sharedLists = sharedResult.status === 'fulfilled' ? sharedResult.value : [];
        const trashDocs = trashResult.status === 'fulfilled' ? trashResult.value.docs : [];

        const now = Date.now();
        const parsedTrash = trashDocs
          .map((entry) => parseSongListTrashRecord(entry.id, entry.data() as Record<string, unknown>))
          .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

        const expiredTrash = parsedTrash.filter((entry) => isTrashExpired(entry.purgeAt, now));
        const activeTrash = parsedTrash.filter((entry) => !isTrashExpired(entry.purgeAt, now));

        if (expiredTrash.length > 0) {
          void Promise.all(
            expiredTrash.map((entry) => deleteDoc(doc(firestore, 'users', userId, TRASH_COLLECTION, entry.id)))
          ).catch((error) => {
            console.warn('Failed to purge expired songlist trash items.', error);
          });
        }

        setTrashedSongLists(
          activeTrash
            .map((entry) => ({
              trashId: entry.id,
              itemType: 'songlist' as const,
              deletedAt: entry.deletedAt,
              purgeAt: entry.purgeAt,
              songList: entry.data,
            }))
            .sort(compareTrashByDeletedAtDesc)
        );

        if (!categorySnapshot || !listSnapshot) {
          if (categoryResult.status === 'rejected') {
            console.error('Failed to load song list categories from Firestore.', categoryResult.reason);
          }
          if (listResult.status === 'rejected') {
            console.error('Failed to load song lists from Firestore.', listResult.reason);
          }
          return;
        }

        const fetchedCategories = categorySnapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }) as SongListCategory);
        const nextCategories = ensureSongListsCategory(fetchedCategories);
        const ownedLists = listSnapshot.docs.map((entry) =>
          songListFromDoc(entry.id, entry.data() as Record<string, unknown>, userId, userId)
        );

        const nextLists = normalizeSongLists([...ownedLists, ...sharedLists]);

        setCategories(nextCategories);
        setSongLists(nextLists);

        // Persist default category if it doesn't exist in Firestore
        if (nextCategories.length > fetchedCategories.length) {
          const defaultCat = nextCategories.find(c => c.id === SONGLISTS_CATEGORY_ID);
          if (defaultCat) void writeCategory(defaultCat, userId);
        }
      })
      .catch((error) => {
        console.error('Failed to load song lists from Firestore. Falling back to local data.', error);
      });
  }, [userId]);

  useEffect(() => {
    writeLocal(KEY_FOLDERS, categories);
    writeLocal(KEY_LISTS, songLists);
  }, [categories, songLists]);

  const addCategory = useCallback((name: string) => {
    const id = crypto.randomUUID();
    const nextCategory: SongListCategory = { id, name };

    setCategories((prev) => {
      const nextCategories = withSequentialSortOrder([...prev, nextCategory]);
      if (db && userId) {
        const saved = nextCategories.find(c => c.id === id);
        if (saved) {
          void writeCategory(saved, userId).catch((error) => {
            console.error('Failed to save song list category in Firestore.', error);
            setCategories(prev);
          });
        }
      }
      return nextCategories;
    });
  }, [userId]);

  const deleteCategory = useCallback((id: string) => {
    if (id === SONGLISTS_CATEGORY_ID) return;

    setCategories((prevCategories) => {
      const nextCategories = withSequentialSortOrder(prevCategories.filter((c) => c.id !== id));
      
      setSongLists((prevLists) => {
        const nextLists = normalizeSongLists(
          prevLists.map((list) => (list.folderId === id ? { ...list, folderId: undefined } : list))
        );

        if (db && userId) {
          const changedLists = nextLists.filter((list) => {
            const prev = prevLists.find((p) => p.id === list.id);
            return prev && (prev.folderId !== list.folderId || prev.sortOrder !== list.sortOrder);
          });

          Promise.all([
            deleteDoc(doc(db, 'users', userId, CATEGORIES_COLLECTION, id)),
            ...nextCategories.map((cat) => writeCategory(cat, userId)),
            ...changedLists.map((list) => writeSongList(list, userId)),
          ]).catch((error) => {
            console.error('Failed to delete song list category in Firestore.', error);
            setCategories(prevCategories);
            setSongLists(prevLists);
          });
        }
        return nextLists;
      });

      return nextCategories;
    });
    
    setActiveCategoryState((prev) => (prev === id ? null : prev));
  }, [userId]);

  const addSongList = useCallback((name: string, folderId?: string) => {
    const id = crypto.randomUUID();
    const nextSongList: SongList = {
      id,
      name,
      songIds: [],
      folderId,
      ownerId: userId ?? undefined,
      collaboratorIds: [],
      collaborationPermissions: {},
      accessRole: 'owner',
    };

    setSongLists((prev) => {
      const nextLists = normalizeSongLists([...prev, nextSongList]);
      if (db && userId) {
        const changed = nextLists.filter((list) => {
          const p = prev.find((item) => item.id === list.id);
          return !p || p.sortOrder !== list.sortOrder;
        });
        Promise.all(changed.map((list) => writeSongList(list, userId))).catch((error) => {
          console.error('Failed to save song lists in Firestore.', error);
          setSongLists(prev);
        });
      }
      return nextLists;
    });
  }, [userId]);

  const deleteSongList = useCallback((id: string) => {
    let trashedEntry: TrashedSongList | null = null;

    setSongLists((prev) => {
      const deleting = prev.find((list) => list.id === id);
      if (!deleting || !isSongListOwner(deleting, userId)) {
        return prev;
      }

      const { deletedAt, purgeAt } = createTrashTimestamps();
      const trashId = crypto.randomUUID();
      trashedEntry = {
        trashId,
        itemType: 'songlist',
        deletedAt,
        purgeAt,
        songList: deleting,
      };

      setTrashedSongLists((prevTrash) => [trashedEntry as TrashedSongList, ...prevTrash].sort(compareTrashByDeletedAtDesc));

      const nextLists = normalizeSongLists(prev.filter((list) => list.id !== id));
      if (db && userId) {
        const changed = nextLists.filter((list) => {
          const p = prev.find((item) => item.id === list.id);
          return p && p.sortOrder !== list.sortOrder;
        });

        Promise.all([
          setDoc(
            doc(db, 'users', userId, TRASH_COLLECTION, trashId),
            createTrashPayload('songlist', deletedAt, purgeAt, deleting)
          ),
          deleteDoc(doc(db, 'users', userId, LISTS_COLLECTION, id)),
          ...changed.map((list) => writeSongList(list, userId)),
        ]).catch((error) => {
          console.error('Failed to move song list to trash in Firestore.', error);
          setSongLists(prev);
          if (trashedEntry) {
            setTrashedSongLists((prevTrash) => prevTrash.filter((entry) => entry.trashId !== trashedEntry?.trashId));
          }
        });
      }
      return nextLists;
    });
    setActiveSongListId((prev) => (prev === id ? null : prev));
  }, [userId]);

  const restoreSongListFromTrash = useCallback(async (trashId: string): Promise<string | null> => {
    const trashed = trashedSongLists.find((entry) => entry.trashId === trashId);
    if (!trashed) {
      return 'Songlist was not found in trash.';
    }

    const restoredSongList = {
      ...trashed.songList,
      ownerId: userId ?? trashed.songList.ownerId,
      accessRole: 'owner' as const,
    };

    setTrashedSongLists((prev) => prev.filter((entry) => entry.trashId !== trashId));
    setSongLists((prev) => normalizeSongLists([restoredSongList, ...prev.filter((entry) => entry.id !== restoredSongList.id)]));

    if (!db || !userId) {
      return null;
    }

    try {
      await Promise.all([
        writeSongList(restoredSongList, userId),
        deleteDoc(doc(db, 'users', userId, TRASH_COLLECTION, trashId)),
      ]);
      return null;
    } catch (error) {
      setSongLists((prev) => prev.filter((entry) => entry.id !== restoredSongList.id));
      setTrashedSongLists((prev) => [trashed, ...prev].sort(compareTrashByDeletedAtDesc));
      return error instanceof Error ? error.message : 'Failed to restore songlist.';
    }
  }, [trashedSongLists, userId]);

  const deleteSongListPermanently = useCallback(async (trashId: string): Promise<string | null> => {
    const previousTrash = trashedSongLists;
    setTrashedSongLists((prev) => prev.filter((entry) => entry.trashId !== trashId));

    if (!db || !userId) {
      return null;
    }

    try {
      await deleteDoc(doc(db, 'users', userId, TRASH_COLLECTION, trashId));
      return null;
    } catch (error) {
      setTrashedSongLists(previousTrash);
      return error instanceof Error ? error.message : 'Failed to permanently delete songlist.';
    }
  }, [trashedSongLists, userId]);

  const renameSongList = useCallback((id: string, name: string) => {
    const trimmedName = name.trim();
    if (!trimmedName) return;

    setSongLists((prev) => {
      const list = prev.find((l) => l.id === id);
      if (!list) return prev;
      if (!canEditSongList(list, userId)) return prev;
      if (list.name === trimmedName) return prev;

      const nextList = { ...list, name: trimmedName };
      const nextLists = prev.map((l) => (l.id === id ? nextList : l));

      if (db && userId) {
        void writeSongList(nextList, userId).catch((error) => {
          console.error('Failed to rename song list in Firestore.', error);
          setSongLists(prev);
        });
      }

      return nextLists;
    });
  }, [userId]);

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
      if (!canEditSongList(list, userId)) return prev;

      const nextList = { ...list, songIds: [...list.songIds, songId] };
      const nextLists = prev.map((l) => (l.id === listId ? nextList : l));

      if (db && userId) {
        void writeSongList(nextList, userId).catch((error) => {
          console.error('Failed to add song to list in Firestore.', error);
          setSongLists(prev);
        });
      }
      return nextLists;
    });
  }, [userId]);

  const removeSongFromList = useCallback((listId: string, songId: string) => {
    setSongLists((prev) => {
      const list = prev.find((l) => l.id === listId);
      if (!list) return prev;
      if (!canEditSongList(list, userId)) return prev;

      const nextList = { ...list, songIds: list.songIds.filter((id) => id !== songId) };
      const nextLists = prev.map((l) => (l.id === listId ? nextList : l));

      if (db && userId) {
        void writeSongList(nextList, userId).catch((error) => {
          console.error('Failed to remove song from list in Firestore.', error);
          setSongLists(prev);
        });
      }
      return nextLists;
    });
  }, [userId]);

  const moveSongInList = useCallback((listId: string, songId: string, beforeSongId: string | null) => {
    setSongLists((prev) => {
      const list = prev.find((l) => l.id === listId);
      if (!list) return prev;
      if (!canEditSongList(list, userId)) return prev;

      const nextSongIds = moveIdBefore(list.songIds, songId, beforeSongId);
      if (nextSongIds === list.songIds) return prev;

      const nextList = { ...list, songIds: nextSongIds };
      const nextLists = prev.map((l) => (l.id === listId ? nextList : l));

      if (db && userId) {
        void writeSongList(nextList, userId).catch((error) => {
          console.error('Failed to reorder songs in list in Firestore.', error);
          setSongLists(prev);
        });
      }
      return nextLists;
    });
  }, [userId]);

  const updateSongListAppearance = useCallback((listId: string, appearance: { icon?: string }) => {
    setSongLists((prev) => {
      const list = prev.find((l) => l.id === listId);
      if (!list) return prev;
      if (!canEditSongList(list, userId)) return prev;

      const nextList: SongList = {
        ...list,
        icon: appearance.icon,
      };
      const nextLists = prev.map((l) => (l.id === listId ? nextList : l));

      if (db && userId) {
        void writeSongList(nextList, userId).catch((error) => {
          console.error('Failed to update song list appearance in Firestore.', error);
          setSongLists(prev);
        });
      }

      return nextLists;
    });
  }, [userId]);

  const moveSongList = useCallback((listId: string, targetCategoryId?: string, beforeListId?: string | null) => {
    setSongLists((prev) => {
      const moving = prev.find((l) => l.id === listId);
      if (!moving) return prev;
      if (!canEditSongList(moving, userId)) return prev;

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
        const targetIndex = findLastIndexByFolderId(withoutMoving, targetCategoryId);
        nextLists = normalizeSongLists(
          targetIndex >= 0
            ? [...withoutMoving.slice(0, targetIndex + 1), moved, ...withoutMoving.slice(targetIndex + 1)]
            : [...withoutMoving, moved]
        );
      }

      if (db && userId) {
        const changed = nextLists.filter((list) => {
          const p = prev.find((item) => item.id === list.id);
          return !p || p.sortOrder !== list.sortOrder || p.folderId !== list.folderId;
        });
        Promise.all(changed.map((list) => writeSongList(list, userId))).catch((error) => {
          console.error('Failed to move song list in Firestore.', error);
          setSongLists(prev);
        });
      }
      return nextLists;
    });
  }, [userId]);

  return (
    <SongListsContext.Provider
      value={{
        categories,
        songLists,
        trashedSongLists,
        activeCategoryId,
        activeSongListId,
        addCategory,
        deleteCategory,
        addSongList,
        deleteSongList,
        restoreSongListFromTrash,
        deleteSongListPermanently,
        renameSongList,
        addSongToList,
        removeSongFromList,
        moveSongInList,
        updateSongListAppearance,
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
