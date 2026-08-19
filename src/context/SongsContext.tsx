/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';
import type { Song } from '../types';
import { dataClient } from '../lib/dataClient';
import { useAuth } from './AuthContext';

const LOCAL_STORAGE_KEY = 'gigboy-local-songs';

function compareSongs(a: Song, b: Song) {
  const aHasSortOrder = typeof a.sortOrder === 'number';
  const bHasSortOrder = typeof b.sortOrder === 'number';

  if (aHasSortOrder && bHasSortOrder) {
    return (a.sortOrder as number) - (b.sortOrder as number);
  }

  if (aHasSortOrder) return -1;
  if (bHasSortOrder) return 1;

  return a.title.localeCompare(b.title);
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

function canEditSong(song: Song, userId: string | null) {
  if (!userId) return false;
  return song.ownerId === userId || song.accessRole === 'editor';
}

function isSongOwner(song: Song, userId: string | null) {
  return Boolean(userId && song.ownerId === userId);
}

export function SongsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [userSongs, setUserSongs] = useState<Song[]>(() => readLocalSongs());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }
    // Self-host's GET /api/songs already returns both owned songs and songs shared with the
    // caller via an accepted collaboration invite (server-side jsonb collaborator match), so no
    // separate shared-resource fetch is needed here.
    setLoading(true);
    dataClient.songs
      .list()
      .then((loaded) => setUserSongs(normalizeSongs(loaded)))
      .catch((err) => console.error('Failed to load songs.', err))
      .finally(() => setLoading(false));
  }, [userId]);

  useEffect(() => {
    writeLocalSongs(userSongs);
  }, [userSongs]);

  const songs = useMemo(() => [...userSongs], [userSongs]);

  const addSong = useCallback(async (song: Song): Promise<string | null> => {
    const pendingAdd: { nextSong: Song | null; error: string | null } = {
      nextSong: null,
      error: null,
    };

    setUserSongs((prev) => {
      const ownSongs = prev.filter((entry) => (entry.ownerId ?? userId) === userId);

      const nextSong: Song = {
        ...song,
        ownerId: userId ?? undefined,
        collaboratorIds: song.collaboratorIds ?? [],
        collaborationPermissions: song.collaborationPermissions ?? {},
        accessRole: 'owner',
        sortOrder: song.sortOrder ?? ownSongs.reduce((min, entry) => Math.min(min, entry.sortOrder ?? 0), 0) - 1,
      };

      pendingAdd.nextSong = nextSong;
      return normalizeSongs([nextSong, ...prev]);
    });

    if (pendingAdd.error) {
      return pendingAdd.error;
    }

    if (!pendingAdd.nextSong) {
      return 'Failed to prepare song for save.';
    }

    if (!userId) {
      return null;
    }

    try {
      await dataClient.songs.create(pendingAdd.nextSong);
      return null;
    } catch (err) {
      setUserSongs((prev) => prev.filter((s) => s.id !== pendingAdd.nextSong?.id));
      return err instanceof Error ? err.message : 'Failed to save song.';
    }
  }, [userId]);

  const updateSong = useCallback(async (song: Song): Promise<string | null> => {
    let previousSong: Song | null = null;
    let nextSong: Song | null = null;

    setUserSongs((prev) => {
      previousSong = prev.find((s) => s.id === song.id) ?? null;
      if (!previousSong) return prev;
      if (!canEditSong(previousSong, userId)) return prev;
      nextSong = {
        ...song,
        ownerId: previousSong.ownerId,
        collaboratorIds: previousSong.collaboratorIds,
        collaborationPermissions: previousSong.collaborationPermissions,
        accessRole: previousSong.accessRole,
        sortOrder: song.sortOrder ?? previousSong.sortOrder,
      };
      return prev.map((s) => (s.id === song.id ? (nextSong as Song) : s));
    });

    if (!previousSong || !nextSong) {
      return 'Song not found.';
    }

    if (!canEditSong(previousSong, userId)) {
      return 'You only have viewer access to this song.';
    }

    if (!userId) {
      return null;
    }

    const songToSave: Song = nextSong;

    try {
      // Works whether we own the song or are an editor-collaborator on someone else's —
      // the server's PUT /songs/:id allows both (see server/routes/crud.ts).
      await dataClient.songs.update(songToSave);
      return null;
    } catch (err) {
      if (previousSong) {
        setUserSongs((prev) => prev.map((s) => (s.id === previousSong?.id ? previousSong : s)));
      }
      return err instanceof Error ? err.message : 'Failed to update song.';
    }
  }, [userId]);

  const deleteSong = useCallback(async (id: string) => {
    const targetSong = userSongs.find((entry) => entry.id === id);
    if (!targetSong || !isSongOwner(targetSong, userId)) {
      return;
    }

    setUserSongs((prev) => prev.filter((s) => s.id !== id));

    if (!userId) {
      return;
    }

    try {
      // The server moves the song to trash as part of the delete (see server/routes/crud.ts),
      // so there's nothing else to persist client-side here.
      await dataClient.songs.remove(id);
    } catch (error) {
      console.error('Failed to delete song. Restoring list from server.', error);
      dataClient.songs.list().then((songs) => {
        setUserSongs(normalizeSongs(songs));
      });
    }
  }, [userId, userSongs]);

  const moveSong = useCallback((songId: string, beforeSongId: string | null) => {
    let previousSongs: Song[] = [];
    let nextSongs: Song[] = [];

    setUserSongs((prev) => {
      const movingSong = prev.find((song) => song.id === songId);
      if (!movingSong || !isSongOwner(movingSong, userId)) {
        previousSongs = prev;
        nextSongs = prev;
        return prev;
      }

      previousSongs = prev;
      const reorderedSongs = moveSongInArray(prev, songId, beforeSongId);
      if (reorderedSongs === prev) {
        nextSongs = prev;
        return prev;
      }

      nextSongs = withSequentialSortOrder(reorderedSongs);
      return nextSongs;
    });

    if (!userId || nextSongs === previousSongs) {
      return;
    }

    const changedSongs = nextSongs.filter((song, index) => {
      const previousSong = previousSongs[index];
      return previousSong?.id !== song.id || previousSong?.sortOrder !== song.sortOrder;
    }).filter((song) => isSongOwner(song, userId));

    if (changedSongs.length === 0) {
      return;
    }

    Promise.all(changedSongs.map((song) => dataClient.songs.update(song))).catch((error) => {
      console.error('Failed to reorder songs.', error);
      setUserSongs(previousSongs);
    });
  }, [userId]);

  const value = useMemo(
    () => ({
      songs,
      loading,
      addSong,
      updateSong,
      deleteSong,
      moveSong,
    }),
    [songs, loading, addSong, updateSong, deleteSong, moveSong]
  );

  return (
    <SongsContext.Provider value={value}>
      {children}
    </SongsContext.Provider>
  );
}

export function useSongs() {
  const ctx = useContext(SongsContext);
  if (!ctx) throw new Error('useSongs must be used inside SongsProvider');
  return ctx;
}
