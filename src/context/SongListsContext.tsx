import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { ReactNode } from 'react';
import type { SongList, SongListFolder } from '../types';

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

interface SongListsContextValue {
  folders: SongListFolder[];
  songLists: SongList[];
  activeSongListId: string | null;
  addFolder: (name: string) => void;
  deleteFolder: (id: string) => void;
  addSongList: (name: string, folderId?: string) => void;
  deleteSongList: (id: string) => void;
  addSongToList: (listId: string, songId: string) => void;
  removeSongFromList: (listId: string, songId: string) => void;
  setActiveSongListId: (id: string | null) => void;
}

const SongListsContext = createContext<SongListsContextValue | null>(null);

export function SongListsProvider({ children }: { children: ReactNode }) {
  const [folders, setFolders] = useState<SongListFolder[]>(() => readLocal(KEY_FOLDERS, []));
  const [songLists, setSongLists] = useState<SongList[]>(() => readLocal(KEY_LISTS, []));
  const [activeSongListId, setActiveSongListId] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem(KEY_FOLDERS, JSON.stringify(folders));
  }, [folders]);

  useEffect(() => {
    localStorage.setItem(KEY_LISTS, JSON.stringify(songLists));
  }, [songLists]);

  const addFolder = useCallback((name: string) => {
    setFolders((prev) => [...prev, { id: crypto.randomUUID(), name }]);
  }, []);

  const deleteFolder = useCallback((id: string) => {
    setFolders((prev) => prev.filter((f) => f.id !== id));
    setSongLists((prev) => prev.map((l) => l.folderId === id ? { ...l, folderId: undefined } : l));
  }, []);

  const addSongList = useCallback((name: string, folderId?: string) => {
    setSongLists((prev) => [...prev, { id: crypto.randomUUID(), name, songIds: [], folderId }]);
  }, []);

  const deleteSongList = useCallback((id: string) => {
    setSongLists((prev) => prev.filter((l) => l.id !== id));
    setActiveSongListId((prev) => (prev === id ? null : prev));
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

  return (
    <SongListsContext.Provider
      value={{
        folders,
        songLists,
        activeSongListId,
        addFolder,
        deleteFolder,
        addSongList,
        deleteSongList,
        addSongToList,
        removeSongFromList,
        setActiveSongListId,
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
