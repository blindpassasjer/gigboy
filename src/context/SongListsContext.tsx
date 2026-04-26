import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { ReactNode } from 'react';
import type { SongList, SongListCategory } from '../types';

const KEY_FOLDERS = 'songbook-folders';
const KEY_LISTS = 'songbook-song-lists';

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

export function SongListsProvider({ children }: { children: ReactNode }) {
  const [categories, setCategories] = useState<SongListCategory[]>(() => readLocal(KEY_FOLDERS, []));
  const [songLists, setSongLists] = useState<SongList[]>(() => readLocal(KEY_LISTS, []));
  const [activeCategoryId, setActiveCategoryState] = useState<string | null>(null);
  const [activeSongListId, setActiveSongListId] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem(KEY_FOLDERS, JSON.stringify(categories));
  }, [categories]);

  useEffect(() => {
    localStorage.setItem(KEY_LISTS, JSON.stringify(songLists));
  }, [songLists]);

  const addCategory = useCallback((name: string) => {
    setCategories((prev) => [...prev, { id: crypto.randomUUID(), name }]);
  }, []);

  const deleteCategory = useCallback((id: string) => {
    setCategories((prev) => prev.filter((f) => f.id !== id));
    setSongLists((prev) => prev.map((l) => l.folderId === id ? { ...l, folderId: undefined } : l));
    setActiveCategoryState((prev) => (prev === id ? null : prev));
  }, []);

  const addSongList = useCallback((name: string, folderId?: string) => {
    setSongLists((prev) => [...prev, { id: crypto.randomUUID(), name, songIds: [], folderId }]);
  }, []);

  const deleteSongList = useCallback((id: string) => {
    setSongLists((prev) => prev.filter((l) => l.id !== id));
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
    setSongLists((prev) =>
      prev.map((l) =>
        l.id === listId && !l.songIds.includes(songId)
          ? { ...l, songIds: [...l.songIds, songId] }
          : l
      )
    );
  }, []);

  const removeSongFromList = useCallback((listId: string, songId: string) => {
    setSongLists((prev) =>
      prev.map((l) =>
        l.id === listId ? { ...l, songIds: l.songIds.filter((id) => id !== songId) } : l
      )
    );
  }, []);

  const moveSongInList = useCallback((listId: string, songId: string, beforeSongId: string | null) => {
    setSongLists((prev) =>
      prev.map((list) => {
        if (list.id !== listId) {
          return list;
        }

        const nextSongIds = moveSongId(list.songIds, songId, beforeSongId);
        return nextSongIds === list.songIds ? list : { ...list, songIds: nextSongIds };
      })
    );
  }, []);

  const moveSongList = useCallback((listId: string, targetCategoryId?: string, beforeListId?: string | null) => {
    setSongLists((prev) => {
      const moving = prev.find((l) => l.id === listId);
      if (!moving) return prev;

      const normalizedTarget = targetCategoryId;
      const withoutMoving = prev.filter((l) => l.id !== listId);
      const moved: SongList = { ...moving, folderId: normalizedTarget };

      if (beforeListId) {
        const beforeIndex = withoutMoving.findIndex((l) => l.id === beforeListId);
        if (beforeIndex >= 0) {
          return [
            ...withoutMoving.slice(0, beforeIndex),
            moved,
            ...withoutMoving.slice(beforeIndex),
          ];
        }
      }

      for (let i = withoutMoving.length - 1; i >= 0; i -= 1) {
        if (withoutMoving[i].folderId === normalizedTarget) {
          return [
            ...withoutMoving.slice(0, i + 1),
            moved,
            ...withoutMoving.slice(i + 1),
          ];
        }
      }

      return [...withoutMoving, moved];
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
