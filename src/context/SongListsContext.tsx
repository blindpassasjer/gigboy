/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';
import type { SongList, SongListCategory } from '../types';
import { dataClient } from '../lib/dataClient';
import { useAuth } from './AuthContext';
import { moveIdBefore } from '../utils/arrayUtils';

const KEY_FOLDERS = 'gigboy-folders';
const KEY_LISTS = 'gigboy-song-lists';

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
  activeCategoryId: string | null;
  activeSongListId: string | null;
  addCategory: (name: string) => void;
  deleteCategory: (id: string) => void;
  addSongList: (name: string, folderId?: string) => void;
  deleteSongList: (id: string) => void;
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
  const [activeCategoryId, setActiveCategoryState] = useState<string | null>(null);
  const [activeSongListId, setActiveSongListId] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    // Self-host's GET /api/song-lists already includes lists shared with the caller via an
    // accepted collaboration invite (server-side jsonb collaborator match) — see SongsContext.tsx.
    dataClient.songLists
      .list()
      .then((loaded) => setSongLists(normalizeSongLists(loaded)))
      .catch((err) => console.error('Failed to load song lists.', err));
  }, [userId]);

  useEffect(() => {
    // Folders/categories are organizational labels only — self-host keeps them local-only
    // (no server table for them; song lists reference a category by id via `folderId`, which
    // does sync — see server/db/schema.ts's `song_lists.folder_id`).
    writeLocal(KEY_FOLDERS, categories);
    writeLocal(KEY_LISTS, songLists);
  }, [categories, songLists]);

  const addCategory = useCallback((name: string) => {
    const id = crypto.randomUUID();
    const nextCategory: SongListCategory = { id, name };

    setCategories((prev) => withSequentialSortOrder([...prev, nextCategory]));
  }, []);

  const deleteCategory = useCallback((id: string) => {
    if (id === SONGLISTS_CATEGORY_ID) return;

    setCategories((prevCategories) => withSequentialSortOrder(prevCategories.filter((c) => c.id !== id)));

    setSongLists((prevLists) => {
      const nextLists = normalizeSongLists(
        prevLists.map((list) => (list.folderId === id ? { ...list, folderId: undefined } : list))
      );

      if (userId) {
        const changedLists = nextLists.filter((list) => {
          const prev = prevLists.find((p) => p.id === list.id);
          return prev && (prev.folderId !== list.folderId || prev.sortOrder !== list.sortOrder);
        });

        Promise.all(changedLists.map((list) => dataClient.songLists.update(list))).catch((error) => {
          console.error('Failed to update song lists after deleting category.', error);
          setSongLists(prevLists);
        });
      }
      return nextLists;
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
      if (userId) {
        const changed = nextLists.filter((list) => {
          const p = prev.find((item) => item.id === list.id);
          return !p || p.sortOrder !== list.sortOrder;
        });
        Promise.all(changed.map((list) => dataClient.songLists.update(list))).catch((error) => {
          console.error('Failed to save song lists.', error);
          setSongLists(prev);
        });
      }
      return nextLists;
    });
  }, [userId]);

  const deleteSongList = useCallback((id: string) => {
    setSongLists((prev) => {
      const deleting = prev.find((list) => list.id === id);
      if (!deleting || !isSongListOwner(deleting, userId)) {
        return prev;
      }

      const nextLists = normalizeSongLists(prev.filter((list) => list.id !== id));
      if (userId) {
        const changed = nextLists.filter((list) => {
          const p = prev.find((item) => item.id === list.id);
          return p && p.sortOrder !== list.sortOrder;
        });

        // The server moves the list to trash as part of the delete (see server/routes/crud.ts).
        Promise.all([
          dataClient.songLists.remove(id),
          ...changed.map((list) => dataClient.songLists.update(list)),
        ]).catch((error) => {
          console.error('Failed to delete song list.', error);
          setSongLists(prev);
        });
      }
      return nextLists;
    });
    setActiveSongListId((prev) => (prev === id ? null : prev));
  }, [userId]);

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

      if (userId) {
        void dataClient.songLists.update(nextList).catch((error) => {
          console.error('Failed to rename song list.', error);
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

      if (userId) {
        void dataClient.songLists.update(nextList).catch((error) => {
          console.error('Failed to add song to list.', error);
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

      if (userId) {
        void dataClient.songLists.update(nextList).catch((error) => {
          console.error('Failed to remove song from list.', error);
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

      if (userId) {
        void dataClient.songLists.update(nextList).catch((error) => {
          console.error('Failed to reorder songs in list.', error);
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

      if (userId) {
        void dataClient.songLists.update(nextList).catch((error) => {
          console.error('Failed to update song list appearance.', error);
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

      if (userId) {
        const changed = nextLists.filter((list) => {
          const p = prev.find((item) => item.id === list.id);
          return !p || p.sortOrder !== list.sortOrder || p.folderId !== list.folderId;
        });
        Promise.all(changed.map((list) => dataClient.songLists.update(list))).catch((error) => {
          console.error('Failed to move song list.', error);
          setSongLists(prev);
        });
      }
      return nextLists;
    });
  }, [userId]);

  const value = useMemo(
    () => ({
      categories,
      songLists,
      activeCategoryId,
      activeSongListId,
      addCategory,
      deleteCategory,
      addSongList,
      deleteSongList,
      renameSongList,
      addSongToList,
      removeSongFromList,
      moveSongInList,
      updateSongListAppearance,
      moveSongList,
      setActiveCategoryId,
      setActiveSongListId: setActiveListId,
      clearActiveSelection,
    }),
    [
      categories,
      songLists,
      activeCategoryId,
      activeSongListId,
      addCategory,
      deleteCategory,
      addSongList,
      deleteSongList,
      renameSongList,
      addSongToList,
      removeSongFromList,
      moveSongInList,
      updateSongListAppearance,
      moveSongList,
      setActiveCategoryId,
      setActiveListId,
      clearActiveSelection,
    ]
  );

  return (
    <SongListsContext.Provider value={value}>
      {children}
    </SongListsContext.Provider>
  );
}

export function useSongLists() {
  const ctx = useContext(SongListsContext);
  if (!ctx) throw new Error('useSongLists must be used inside SongListsProvider');
  return ctx;
}
