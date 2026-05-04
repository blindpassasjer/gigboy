/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { ReactNode } from 'react';
import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
} from 'firebase/firestore';
import type { Song, TrashedSong } from '../types';
import { loadAcceptedSharedResources } from '../lib/collaboration';
import { db, firebaseEnabled } from '../lib/firebase';
import {
  compareTrashByDeletedAtDesc,
  createTrashPayload,
  createTrashTimestamps,
  isTrashExpired,
  parseSongTrashRecord,
  TRASH_COLLECTION,
} from '../lib/trash';
import { useAuth } from './AuthContext';

const LOCAL_STORAGE_KEY = 'gigboi-local-songs';

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
  trashedSongs: TrashedSong[];
  loading: boolean;
  addSong: (song: Song) => Promise<string | null>;
  updateSong: (song: Song) => Promise<string | null>;
  deleteSong: (id: string) => Promise<void>;
  restoreSongFromTrash: (trashId: string) => Promise<string | null>;
  deleteSongPermanently: (trashId: string) => Promise<string | null>;
  moveSong: (songId: string, beforeSongId: string | null) => void;
}

const SongsContext = createContext<SongsContextValue | null>(null);
const SONGS_COLLECTION = 'songs';

function songFromOwnedDoc(id: string, data: Record<string, unknown>, ownerId: string, currentUserId: string): Song {
  const song = { id, ownerId, ...(data as Omit<Song, 'id'>) } as Song;
  const role = ownerId === currentUserId
    ? 'owner'
    : song.collaborationPermissions?.[currentUserId];
  return {
    ...song,
    accessRole: role === 'editor' || role === 'viewer' ? role : ownerId === currentUserId ? 'owner' : undefined,
  };
}

function canEditSong(song: Song, userId: string | null) {
  if (!userId) return false;
  return song.ownerId === userId || song.accessRole === 'editor';
}

function isSongOwner(song: Song, userId: string | null) {
  return Boolean(userId && song.ownerId === userId);
}

function songsCollectionPath(userId: string) {
  return ['users', userId, SONGS_COLLECTION] as const;
}

export function SongsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [userSongs, setUserSongs] = useState<Song[]>(() => (firebaseEnabled ? [] : readLocalSongs()));
  const [trashedSongs, setTrashedSongs] = useState<TrashedSong[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db || !userId) {
      setTrashedSongs([]);
      setLoading(false);
      return;
    }

    const firestore = db;

    Promise.allSettled([
      getDocs(collection(firestore, ...songsCollectionPath(userId))),
      loadAcceptedSharedResources({
        db: firestore,
        userId,
        resourceType: 'song',
        mapResource: (invite, id, data) => songFromOwnedDoc(id, data, invite.ownerId, userId),
      }),
      getDocs(collection(firestore, 'users', userId, TRASH_COLLECTION)),
    ])
      .then(async ([ownedResult, sharedResult, trashResult]) => {
        const ownedSnap = ownedResult.status === 'fulfilled' ? ownedResult.value : null;
        const sharedSongs = sharedResult.status === 'fulfilled' ? normalizeSongs(sharedResult.value) : [];
        const trashDocs = trashResult.status === 'fulfilled' ? trashResult.value.docs : [];
        const now = Date.now();

        const parsedTrash = trashDocs
          .map((entry) => parseSongTrashRecord(entry.id, entry.data() as Record<string, unknown>))
          .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

        const expiredTrash = parsedTrash.filter((entry) => isTrashExpired(entry.purgeAt, now));
        const activeTrash = parsedTrash.filter((entry) => !isTrashExpired(entry.purgeAt, now));

        if (expiredTrash.length > 0) {
          void Promise.all(
            expiredTrash.map((entry) => deleteDoc(doc(firestore, 'users', userId, TRASH_COLLECTION, entry.id)))
          ).catch((error) => {
            console.warn('Failed to purge expired song trash items.', error);
          });
        }

        setTrashedSongs(
          activeTrash
            .map((entry) => ({
              trashId: entry.id,
              itemType: 'song' as const,
              deletedAt: entry.deletedAt,
              purgeAt: entry.purgeAt,
              song: entry.data,
            }))
            .sort(compareTrashByDeletedAtDesc)
        );

        if (ownedResult.status === 'rejected') {
          console.error('Failed to load owned songs from Firestore.', ownedResult.reason);
        }

        if (sharedResult.status === 'rejected') {
          console.warn('Failed to load shared songs from Firestore. Continuing with owned songs only.', sharedResult.reason);
        }

        if (trashResult.status === 'rejected') {
          console.warn('Failed to load trashed songs from Firestore.', trashResult.reason);
        }

        const directSongs = normalizeSongs(
          (ownedSnap?.docs ?? []).map((entry) =>
            songFromOwnedDoc(entry.id, entry.data() as Record<string, unknown>, userId, userId)
          )
        );

        if (directSongs.length > 0 || sharedSongs.length > 0) {
          setUserSongs(normalizeSongs([...directSongs, ...sharedSongs]));
          return;
        }

        if (!ownedSnap) {
          return;
        }

        // Legacy root-collection ownership migration is intentionally disabled.
        // Use explicit migration scripts for one-off backfills.
        setUserSongs([]);
      })
      .finally(() => setLoading(false));
  }, [userId]);

  useEffect(() => {
    if (!firebaseEnabled) {
      writeLocalSongs(userSongs);
    }
  }, [userSongs]);

  const songs = [...userSongs];

  const addSong = useCallback(async (song: Song): Promise<string | null> => {
    let nextSong = song;

    setUserSongs((prev) => {
      const ownSongs = prev.filter((entry) => (entry.ownerId ?? userId) === userId);
      nextSong = {
        ...song,
        ownerId: userId ?? undefined,
        collaboratorIds: song.collaboratorIds ?? [],
        collaborationPermissions: song.collaborationPermissions ?? {},
        accessRole: 'owner',
        sortOrder: song.sortOrder ?? Math.min(...ownSongs.map((entry) => entry.sortOrder ?? 0), 0) - 1,
      };

      return normalizeSongs([nextSong, ...prev]);
    });
    if (!db || !userId) {
      return null;
    }

    try {
      const { id, ...rest } = nextSong;
      const firestoreData = Object.fromEntries(
        Object.entries(rest).filter(([, v]) => v !== undefined)
      );
      await setDoc(doc(db, ...songsCollectionPath(userId), id), firestoreData);
      return null;
    } catch (err) {
      setUserSongs((prev) => prev.filter((s) => s.id !== song.id));
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

    if (!db || !userId) {
      return null;
    }

    const songToSave: Song = nextSong;

    try {
      const { id, ...rest } = songToSave;
      const firestoreData = Object.fromEntries(
        Object.entries(rest).filter(([, v]) => v !== undefined)
      );
      const targetOwnerId = songToSave.ownerId ?? userId;
      await setDoc(doc(db, ...songsCollectionPath(targetOwnerId as string), id), firestoreData);
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

    const now = new Date();
    const trashId = crypto.randomUUID();
    const { deletedAt, purgeAt } = createTrashTimestamps(now);
    const trashedSong: TrashedSong = {
      trashId,
      itemType: 'song',
      deletedAt,
      purgeAt,
      song: targetSong,
    };
    setTrashedSongs((prev) => [trashedSong, ...prev].sort(compareTrashByDeletedAtDesc));

    if (!db || !userId) {
      return;
    }

    try {
      await Promise.all([
        setDoc(
          doc(db, 'users', userId, TRASH_COLLECTION, trashId),
          createTrashPayload('song', deletedAt, purgeAt, targetSong)
        ),
        deleteDoc(doc(db, ...songsCollectionPath(userId), id)),
      ]);
    } catch (error) {
      console.error('Failed to move song to trash in Firestore. Restoring list from server.', error);
      setTrashedSongs((prev) => prev.filter((entry) => entry.trashId !== trashId));
      getDocs(collection(db, ...songsCollectionPath(userId))).then((snap) => {
        setUserSongs(normalizeSongs(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Song)));
      });
    }
  }, [userId, userSongs]);

  const restoreSongFromTrash = useCallback(async (trashId: string): Promise<string | null> => {
    const trashed = trashedSongs.find((entry) => entry.trashId === trashId);
    if (!trashed) {
      return 'Song was not found in trash.';
    }

    const restoredSong: Song = {
      ...trashed.song,
      ownerId: userId ?? trashed.song.ownerId,
      accessRole: 'owner',
    };

    setTrashedSongs((prev) => prev.filter((entry) => entry.trashId !== trashId));
    setUserSongs((prev) => normalizeSongs([restoredSong, ...prev.filter((entry) => entry.id !== restoredSong.id)]));

    if (!db || !userId) {
      return null;
    }

    try {
      const { id: restoredSongId, ...rest } = restoredSong;
      const firestoreData = Object.fromEntries(
        Object.entries(rest).filter(([, value]) => value !== undefined)
      );

      await Promise.all([
        setDoc(doc(db, ...songsCollectionPath(userId), restoredSongId), firestoreData),
        deleteDoc(doc(db, 'users', userId, TRASH_COLLECTION, trashId)),
      ]);

      return null;
    } catch (error) {
      setUserSongs((prev) => prev.filter((entry) => entry.id !== restoredSong.id));
      setTrashedSongs((prev) => [trashed, ...prev].sort(compareTrashByDeletedAtDesc));
      return error instanceof Error ? error.message : 'Failed to restore song.';
    }
  }, [trashedSongs, userId]);

  const deleteSongPermanently = useCallback(async (trashId: string): Promise<string | null> => {
    const previousTrash = trashedSongs;
    setTrashedSongs((prev) => prev.filter((entry) => entry.trashId !== trashId));

    if (!db || !userId) {
      return null;
    }

    try {
      await deleteDoc(doc(db, 'users', userId, TRASH_COLLECTION, trashId));
      return null;
    } catch (error) {
      setTrashedSongs(previousTrash);
      return error instanceof Error ? error.message : 'Failed to permanently delete song.';
    }
  }, [trashedSongs, userId]);

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

    if (!db || !userId || nextSongs === previousSongs) {
      return;
    }

    const firestore = db;

    const changedSongs = nextSongs.filter((song, index) => {
      const previousSong = previousSongs[index];
      return previousSong?.id !== song.id || previousSong?.sortOrder !== song.sortOrder;
    }).filter((song) => isSongOwner(song, userId));

    if (changedSongs.length === 0) {
      return;
    }

    Promise.all(
      changedSongs.map((song) => {
        const { id, ...rest } = song;
        const firestoreData = Object.fromEntries(
          Object.entries(rest).filter(([, value]) => value !== undefined)
        );
        return setDoc(doc(firestore, ...songsCollectionPath(userId), id), firestoreData);
      })
    ).catch((error) => {
      console.error('Failed to reorder songs in Firestore.', error);
      setUserSongs(previousSongs);
    });
  }, [userId]);

  return (
    <SongsContext.Provider
      value={{
        songs,
        trashedSongs,
        loading,
        addSong,
        updateSong,
        deleteSong,
        restoreSongFromTrash,
        deleteSongPermanently,
        moveSong,
      }}
    >
      {children}
    </SongsContext.Provider>
  );
}

export function useSongs() {
  const ctx = useContext(SongsContext);
  if (!ctx) throw new Error('useSongs must be used inside SongsProvider');
  return ctx;
}
