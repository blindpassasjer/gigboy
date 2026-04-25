import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { ReactNode } from 'react';
import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  orderBy,
  query,
} from 'firebase/firestore';
import type { Song } from '../types';
import { db } from '../lib/firebase';
import builtinSongs from '../data/songs';

interface SongsContextValue {
  songs: Song[];
  loading: boolean;
  addSong: (song: Song) => Promise<void>;
  deleteSong: (id: string) => Promise<void>;
}

const SongsContext = createContext<SongsContextValue | null>(null);

export function SongsProvider({ children }: { children: ReactNode }) {
  const [userSongs, setUserSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'songs'), orderBy('createdAt', 'desc'));
    getDocs(q)
      .then((snap) => {
        setUserSongs(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Song));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const songs = [...userSongs, ...builtinSongs];

  const addSong = useCallback(async (song: Song) => {
    setUserSongs((prev) => [song, ...prev]);
    try {
      const { id, ...rest } = song;
      await setDoc(doc(db, 'songs', id), rest);
    } catch {
      setUserSongs((prev) => prev.filter((s) => s.id !== song.id));
    }
  }, []);

  const deleteSong = useCallback(async (id: string) => {
    setUserSongs((prev) => prev.filter((s) => s.id !== id));
    try {
      await deleteDoc(doc(db, 'songs', id));
    } catch {
      const q = query(collection(db, 'songs'), orderBy('createdAt', 'desc'));
      getDocs(q).then((snap) => {
        setUserSongs(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Song));
      });
    }
  }, []);

  return (
    <SongsContext.Provider value={{ songs, loading, addSong, deleteSong }}>
      {children}
    </SongsContext.Provider>
  );
}

export function useSongs() {
  const ctx = useContext(SongsContext);
  if (!ctx) throw new Error('useSongs must be used inside SongsProvider');
  return ctx;
}
