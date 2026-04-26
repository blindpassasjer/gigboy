import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { ReactNode } from 'react';
import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
} from 'firebase/firestore';
import type { Song } from '../types';
import { db, firebaseEnabled } from '../lib/firebase';

const LOCAL_STORAGE_KEY = 'songbook-local-songs';

function compareSongs(a: Song, b: Song) {
  const aHasSortOrder = typeof a.sortOrder === 'number';
  const bHasSortOrder = typeof b.sortOrder === 'number';

  if (aHasSortOrder && bHasSortOrder) {
    return (a.sortOrder as number) - (b.sortOrder as number);
  }

  if (aHasSortOrder) return -1;
  if (bHasSortOrder) return 1;

  const aTime = a.createdAt ? Date.parse(a.createdAt) : 0;
  const bTime = b.createdAt ? Date.parse(b.createdAt) : 0;
  return bTime - aTime;
}

function normalizeSongs(songs: Song[]) {
  return [...songs].sort(compareSongs);
}

function moveSongInArray(songs: Song[], songId: string, beforeSongId: string | null) {
  const currentIndex = songs.findIndex((song) => song.id === songId);
  if (currentIndex < 0) return songs;

  const nextSongs = [...songs];
  const [movingSong] = nextSongs.splice(currentIndex, 1);
  if (!movingSong) return songs;

  if (beforeSongId === null) {
    nextSongs.push(movingSong);
    return nextSongs;
  }

  const targetIndex = nextSongs.findIndex((song) => song.id === beforeSongId);
  if (targetIndex < 0) return songs;

  nextSongs.splice(targetIndex, 0, movingSong);
  return nextSongs;
}

function withSequentialSortOrder(songs: Song[]) {
  return songs.map((song, index) => ({ ...song, sortOrder: index }));
}

function readLocalSongs(): Song[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return [];
    const songs = JSON.parse(raw);
    return Array.isArray(songs) ? normalizeSongs(songs as Song[]) : [];
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
  moveSong: (songId: string, beforeSongId: string | null) => void;
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

    getDocs(collection(db, 'songs'))
      .then((snap) => {
        setUserSongs(normalizeSongs(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Song)));
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
    let nextSong = song;

    setUserSongs((prev) => {
      nextSong = {
        ...song,
        sortOrder: song.sortOrder ?? Math.min(...prev.map((entry) => entry.sortOrder ?? 0), 0) - 1,
      };

      return normalizeSongs([nextSong, ...prev]);
    });
    if (!db) {
      return null;
    }

    try {
      const { id, ...rest } = nextSong;
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
    let nextSong: Song | null = null;

    setUserSongs((prev) => {
      previousSong = prev.find((s) => s.id === song.id) ?? null;
      if (!previousSong) return prev;
      nextSong = {
        ...song,
        sortOrder: song.sortOrder ?? previousSong.sortOrder,
      };
      return prev.map((s) => (s.id === song.id ? (nextSong as Song) : s));
    });

    if (!previousSong || !nextSong) {
      return 'Song not found.';
    }

    if (!db) {
      return null;
    }

    const songToSave: Song = nextSong;

    try {
      const { id, ...rest } = songToSave;
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
      getDocs(collection(db, 'songs')).then((snap) => {
        setUserSongs(normalizeSongs(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Song)));
      });
    }
  }, []);

  const moveSong = useCallback((songId: string, beforeSongId: string | null) => {
    let previousSongs: Song[] = [];
    let nextSongs: Song[] = [];

    setUserSongs((prev) => {
      previousSongs = prev;
      const reorderedSongs = moveSongInArray(prev, songId, beforeSongId);
      if (reorderedSongs === prev) {
        nextSongs = prev;
        return prev;
      }

      nextSongs = withSequentialSortOrder(reorderedSongs);
      return nextSongs;
    });

    if (!db || nextSongs === previousSongs) {
      return;
    }

    const firestore = db;

    const changedSongs = nextSongs.filter((song, index) => {
      const previousSong = previousSongs[index];
      return previousSong?.id !== song.id || previousSong?.sortOrder !== song.sortOrder;
    });

    if (changedSongs.length === 0) {
      return;
    }

    Promise.all(
      changedSongs.map((song) => {
        const { id, ...rest } = song;
        const firestoreData = Object.fromEntries(
          Object.entries(rest).filter(([, value]) => value !== undefined)
        );
        return setDoc(doc(firestore, 'songs', id), firestoreData);
      })
    ).catch(() => {
      setUserSongs(previousSongs);
    });
  }, []);

  return (
    <SongsContext.Provider value={{ songs, loading, addSong, updateSong, deleteSong, moveSong }}>
      {children}
    </SongsContext.Provider>
  );
}

export function useSongs() {
  const ctx = useContext(SongsContext);
  if (!ctx) throw new Error('useSongs must be used inside SongsProvider');
  return ctx;
}
