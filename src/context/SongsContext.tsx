import { createContext, useContext, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import type { Song } from '../types';
import builtinSongs from '../data/songs';

const STORAGE_KEY = 'songbook:user-songs';

function loadUserSongs(): Song[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
  } catch {
    return [];
  }
}

interface SongsContextValue {
  songs: Song[];
  addSong: (song: Song) => void;
  deleteSong: (id: string) => void;
}

const SongsContext = createContext<SongsContextValue | null>(null);

export function SongsProvider({ children }: { children: ReactNode }) {
  const [userSongs, setUserSongs] = useState<Song[]>(loadUserSongs);

  const songs = [...userSongs, ...builtinSongs];

  const addSong = useCallback((song: Song) => {
    setUserSongs((prev) => {
      const updated = [song, ...prev];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const deleteSong = useCallback((id: string) => {
    setUserSongs((prev) => {
      const updated = prev.filter((s) => s.id !== id);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  return (
    <SongsContext.Provider value={{ songs, addSong, deleteSong }}>
      {children}
    </SongsContext.Provider>
  );
}

export function useSongs() {
  const ctx = useContext(SongsContext);
  if (!ctx) throw new Error('useSongs must be used inside SongsProvider');
  return ctx;
}
