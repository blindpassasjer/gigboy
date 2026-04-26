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
import { db, firebaseEnabled } from '../lib/firebase';

const LOCAL_STORAGE_KEY = 'songbook-local-songs';

function readLocalSongs(): Song[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return [];
    const songs = JSON.parse(raw);
    return Array.isArray(songs) ? songs as Song[] : [];
  } catch {
    return [];
  }
}

function writeLocalSongs(songs: Song[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(songs));
}

interface SongsContextValue {
  songs: Song[];
  loading: boolean;
  addSong: (song: Song) => Promise<string | null>;
  updateSong: (song: Song) => Promise<string | null>;
  deleteSong: (id: string) => Promise<void>;
}

const SongsContext = createContext<SongsContextValue | null>(null);

export function SongsProvider({ children }: { children: ReactNode }) {
  const [userSongs, setUserSongs] = useState<Song[]>(() => (firebaseEnabled ? [] : readLocalSongs()));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db) {
      setLoading(false);
      return;
    }

    const q = query(collection(db, 'songs'), orderBy('createdAt', 'desc'));
    getDocs(q)
      .then((snap) => {
        setUserSongs(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Song));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!firebaseEnabled) {
      writeLocalSongs(userSongs);
    }
  }, [userSongs]);

  const songs = [...userSongs];

  const addSong = useCallback(async (song: Song): Promise<string | null> => {
    setUserSongs((prev) => [song, ...prev]);
    if (!db) {
      return null;
    }

    try {
      const { id, ...rest } = song;
      const firestoreData = Object.fromEntries(
        Object.entries(rest).filter(([, v]) => v !== undefined)
      );
      await setDoc(doc(db, 'songs', id), firestoreData);
      return null;
    } catch (err) {
      setUserSongs((prev) => prev.filter((s) => s.id !== song.id));
      return err instanceof Error ? err.message : 'Failed to save song.';
    }
  }, []);

  const updateSong = useCallback(async (song: Song): Promise<string | null> => {
    let previousSong: Song | null = null;

    setUserSongs((prev) => {
      previousSong = prev.find((s) => s.id === song.id) ?? null;
      if (!previousSong) return prev;
      return prev.map((s) => (s.id === song.id ? song : s));
    });

    if (!previousSong) {
      return 'Song not found.';
    }

    if (!db) {
      return null;
    }

    try {
      const { id, ...rest } = song;
      const firestoreData = Object.fromEntries(
        Object.entries(rest).filter(([, v]) => v !== undefined)
      );
      await setDoc(doc(db, 'songs', id), firestoreData);
      return null;
    } catch (err) {
      if (previousSong) {
        setUserSongs((prev) => prev.map((s) => (s.id === previousSong?.id ? previousSong : s)));
      }
      return err instanceof Error ? err.message : 'Failed to update song.';
    }
  }, []);

  const deleteSong = useCallback(async (id: string) => {
    setUserSongs((prev) => prev.filter((s) => s.id !== id));
    if (!db) {
      return;
    }

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
    <SongsContext.Provider value={{ songs, loading, addSong, updateSong, deleteSong }}>
      {children}
    </SongsContext.Provider>
  );
}

export function useSongs() {
  const ctx = useContext(SongsContext);
  if (!ctx) throw new Error('useSongs must be used inside SongsProvider');
  return ctx;
}
