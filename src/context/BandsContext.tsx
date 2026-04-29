/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { collection, deleteDoc, doc, getDocs, query, setDoc, where } from 'firebase/firestore';
import type { Band, CollaborationPermission, Song } from '../types';
import { db, firebaseEnabled } from '../lib/firebase';
import {
  createBandOnServer,
  deleteBandOnServer,
  inviteBandMemberOnServer,
  removeBandMemberOnServer,
} from '../lib/bandsApi';
import { useAuth } from './AuthContext';

const BANDS_COLLECTION = 'bands';
const BAND_SONGS_COLLECTION = 'songs';

function compareBands(a: Band, b: Band) {
  const updatedAtA = a.updatedAt ?? a.createdAt;
  const updatedAtB = b.updatedAt ?? b.createdAt;
  if (updatedAtA !== updatedAtB) {
    return updatedAtB.localeCompare(updatedAtA);
  }
  return a.name.localeCompare(b.name);
}

function normalizeBand(id: string, data: Record<string, unknown>): Band {
  return {
    id,
    name: typeof data.name === 'string' ? data.name : 'Untitled band',
    description: typeof data.description === 'string' ? data.description : undefined,
    icon: typeof data.icon === 'string' ? data.icon : undefined,
    ownerId: typeof data.ownerId === 'string' ? data.ownerId : '',
    memberIds: Array.isArray(data.memberIds)
      ? data.memberIds.filter((entry): entry is string => typeof entry === 'string')
      : [],
    memberRoles: typeof data.memberRoles === 'object' && data.memberRoles !== null
      ? Object.fromEntries(
          Object.entries(data.memberRoles as Record<string, unknown>).filter(
            ([, role]) => role === 'viewer' || role === 'editor'
          )
        ) as Record<string, CollaborationPermission>
      : {},
    memberEmails: typeof data.memberEmails === 'object' && data.memberEmails !== null
      ? Object.fromEntries(
          Object.entries(data.memberEmails as Record<string, unknown>).filter(
            ([, email]) => typeof email === 'string'
          )
        ) as Record<string, string>
      : {},
    memberUsernames: typeof data.memberUsernames === 'object' && data.memberUsernames !== null
      ? Object.fromEntries(
          Object.entries(data.memberUsernames as Record<string, unknown>).filter(
            ([, username]) => typeof username === 'string'
          )
        ) as Record<string, string>
      : {},
    memberAvatars: typeof data.memberAvatars === 'object' && data.memberAvatars !== null
      ? Object.fromEntries(
          Object.entries(data.memberAvatars as Record<string, unknown>).filter(
            ([, avatar]) => typeof avatar === 'string'
          )
        ) as Record<string, string>
      : {},
    createdAt: typeof data.createdAt === 'string' ? data.createdAt : new Date(0).toISOString(),
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : undefined,
  };
}

function normalizeBandSong(id: string, data: Record<string, unknown>): Song {
  return {
    id,
    title: typeof data.title === 'string' ? data.title : 'Untitled',
    artist: typeof data.artist === 'string' ? data.artist : undefined,
    language: typeof data.language === 'string' ? data.language : 'en',
    secondaryLanguages: Array.isArray(data.secondaryLanguages)
      ? data.secondaryLanguages.filter((entry): entry is string => typeof entry === 'string')
      : undefined,
    tags: Array.isArray(data.tags)
      ? data.tags.filter((entry): entry is string => typeof entry === 'string')
      : undefined,
    chordpro: typeof data.chordpro === 'string' ? data.chordpro : '',
    capo: typeof data.capo === 'number' ? data.capo : undefined,
    key: typeof data.key === 'string' ? data.key : undefined,
    tempo: typeof data.tempo === 'number' ? data.tempo : undefined,
    timeSignature: typeof data.timeSignature === 'string' ? data.timeSignature : undefined,
    sortOrder: typeof data.sortOrder === 'number' ? data.sortOrder : undefined,
    createdAt: typeof data.createdAt === 'string' ? data.createdAt : undefined,
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : undefined,
    ownerId: typeof data.ownerId === 'string' ? data.ownerId : undefined,
    collaboratorIds: Array.isArray(data.collaboratorIds)
      ? data.collaboratorIds.filter((entry): entry is string => typeof entry === 'string')
      : undefined,
    collaborationPermissions:
      typeof data.collaborationPermissions === 'object' && data.collaborationPermissions !== null
        ? Object.fromEntries(
            Object.entries(data.collaborationPermissions as Record<string, unknown>).filter(
              ([, permission]) => permission === 'viewer' || permission === 'editor'
            )
          ) as Record<string, CollaborationPermission>
        : undefined,
    accessRole: 'owner',
  };
}

function sortBandSongs(songs: Song[]) {
  return [...songs].sort((a, b) => {
    const aSortOrder = typeof a.sortOrder === 'number' ? a.sortOrder : Number.MAX_SAFE_INTEGER;
    const bSortOrder = typeof b.sortOrder === 'number' ? b.sortOrder : Number.MAX_SAFE_INTEGER;
    if (aSortOrder !== bSortOrder) return aSortOrder - bSortOrder;
    return a.title.localeCompare(b.title);
  });
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

interface BandsContextValue {
  bands: Band[];
  bandSongsByBandId: Record<string, Song[]>;
  loading: boolean;
  cloudRequired: boolean;
  createBand: (name: string, description?: string, icon?: string) => Promise<{ bandId: string | null; error: string | null }>;
  deleteBand: (bandId: string) => Promise<string | null>;
  inviteMember: (bandId: string, recipientUsername: string, role: CollaborationPermission) => Promise<string | null>;
  removeMember: (bandId: string, memberId: string) => Promise<string | null>;
  leaveBand: (bandId: string) => Promise<string | null>;
  refreshBandSongs: (bandId: string) => Promise<void>;
  addSongToBandLibrary: (bandId: string, song: Song) => Promise<string | null>;
  removeSongFromBandLibrary: (bandId: string, songId: string) => Promise<string | null>;
  moveBandSong: (bandId: string, songId: string, beforeSongId: string | null) => Promise<string | null>;
}

const BandsContext = createContext<BandsContextValue | null>(null);

export function BandsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const userEmail = user?.email ?? '';
  const userUsername = user?.username ?? '';
  const userAvatar = user?.avatar ?? '';
  const [bands, setBands] = useState<Band[]>([]);
  const [bandSongsByBandId, setBandSongsByBandId] = useState<Record<string, Song[]>>({});
  const [loading, setLoading] = useState(firebaseEnabled);

  useEffect(() => {
    if (!db || !userId) {
      setBands([]);
      setBandSongsByBandId({});
      setLoading(false);
      return;
    }

    setLoading(true);

    getDocs(query(collection(db, BANDS_COLLECTION), where('memberIds', 'array-contains', userId)))
      .then((snapshot) => {
        const nextBands = snapshot.docs
          .map((entry) => normalizeBand(entry.id, entry.data() as Record<string, unknown>))
          .sort(compareBands);
        setBands(nextBands);
      })
      .catch((error) => {
        console.error('Failed to load bands from Firestore.', error);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [userId]);

  const refreshBandSongs = useCallback(async (bandId: string) => {
    if (!db || !userId) return;

    const snapshot = await getDocs(collection(db, BANDS_COLLECTION, bandId, BAND_SONGS_COLLECTION));
    const songs = sortBandSongs(
      snapshot.docs.map((entry) => normalizeBandSong(entry.id, entry.data() as Record<string, unknown>))
    );

    setBandSongsByBandId((prev) => ({
      ...prev,
      [bandId]: songs,
    }));
  }, [userId]);

  const createBand = useCallback(async (name: string, description?: string, icon?: string) => {
    if (!userId) {
      return { bandId: null, error: 'Bands require a signed-in account.' };
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      return { bandId: null, error: 'Band name is required.' };
    }

    try {
      const response = await createBandOnServer({ userId, userEmail, name: trimmedName, description, icon });
      if (db) {
        const created = await getDocs(query(collection(db, BANDS_COLLECTION), where('memberIds', 'array-contains', userId)));
        const nextBands = created.docs
          .map((entry) => normalizeBand(entry.id, entry.data() as Record<string, unknown>))
          .sort(compareBands);
        setBands(nextBands);
      }
      return { bandId: response.bandId, error: null };
    } catch (serverError) {
      if (!db) {
        return {
          bandId: null,
          error: serverError instanceof Error ? serverError.message : 'Failed to create band.',
        };
      }

      try {
        const bandId = crypto.randomUUID();
        const now = new Date().toISOString();
        const trimmedDescription = description?.trim();
        await setDoc(doc(db, BANDS_COLLECTION, bandId), {
          name: trimmedName,
          ...(trimmedDescription ? { description: trimmedDescription } : {}),
          ...(icon ? { icon } : {}),
          ownerId: userId,
          memberIds: [userId],
          memberRoles: {
            [userId]: 'editor',
          },
          memberEmails: userEmail ? { [userId]: userEmail } : {},
          memberUsernames: userUsername ? { [userId]: userUsername } : {},
          memberAvatars: userAvatar ? { [userId]: userAvatar } : {},
          createdAt: now,
          updatedAt: now,
        });

        const created = await getDocs(query(collection(db, BANDS_COLLECTION), where('memberIds', 'array-contains', userId)));
        const nextBands = created.docs
          .map((entry) => normalizeBand(entry.id, entry.data() as Record<string, unknown>))
          .sort(compareBands);
        setBands(nextBands);

        return { bandId, error: null };
      } catch (fallbackError) {
        const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : 'Failed to create band.';
        const serverMessage = serverError instanceof Error ? serverError.message : 'Server request failed.';
        return {
          bandId: null,
          error: `${fallbackMessage} (server error: ${serverMessage})`,
        };
      }
    }
  }, [userAvatar, userEmail, userId, userUsername]);

  const deleteBand = useCallback(async (bandId: string) => {
    if (!userId) {
      return 'Bands require a signed-in account.';
    }

    const band = bands.find((entry) => entry.id === bandId);
    if (!band) {
      return 'Band not found.';
    }

    try {
      await deleteBandOnServer({ userId, userEmail, bandId });
      setBands((prev) => prev.filter((band) => band.id !== bandId));
      setBandSongsByBandId((prev) => {
        const next = { ...prev };
        delete next[bandId];
        return next;
      });
      return null;
    } catch (serverError) {
      if (!db) {
        return serverError instanceof Error ? serverError.message : 'Failed to delete band.';
      }

      if (band.ownerId !== userId) {
        return serverError instanceof Error ? serverError.message : 'Failed to delete band.';
      }

      try {
        const songsSnapshot = await getDocs(collection(db, BANDS_COLLECTION, bandId, BAND_SONGS_COLLECTION));
        await Promise.all(songsSnapshot.docs.map((entry) => deleteDoc(entry.ref)));
        await deleteDoc(doc(db, BANDS_COLLECTION, bandId));

        setBands((prev) => prev.filter((entry) => entry.id !== bandId));
        setBandSongsByBandId((prev) => {
          const next = { ...prev };
          delete next[bandId];
          return next;
        });

        return null;
      } catch (fallbackError) {
        const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : 'Failed to delete band.';
        const serverMessage = serverError instanceof Error ? serverError.message : 'Server request failed.';
        return `${fallbackMessage} (server error: ${serverMessage})`;
      }
    }
  }, [bands, userEmail, userId]);

  const inviteMember = useCallback(async (bandId: string, recipientUsername: string, role: CollaborationPermission) => {
    if (!userId) {
      return 'Bands require a signed-in account.';
    }

    const band = bands.find((entry) => entry.id === bandId);
    if (!band) {
      return 'Band not found.';
    }

    try {
      await inviteBandMemberOnServer({
        userId,
        userEmail,
        bandId,
        recipientUsername,
        role,
      });
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : 'Failed to invite band member.';
    }
  }, [bands, userEmail, userId]);

  const removeMember = useCallback(async (bandId: string, memberId: string) => {
    if (!userId) {
      return 'Bands require a signed-in account.';
    }

    try {
      await removeBandMemberOnServer({ userId, userEmail, bandId, memberId });
      setBands((prev) => prev.map((band) => {
        if (band.id !== bandId) return band;
        const nextMemberIds = band.memberIds.filter((entry) => entry !== memberId);
        const nextMemberRoles = { ...band.memberRoles };
        const nextMemberEmails = { ...band.memberEmails };
        const nextMemberUsernames = { ...band.memberUsernames };
        const nextMemberAvatars = { ...band.memberAvatars };
        delete nextMemberRoles[memberId];
        delete nextMemberEmails[memberId];
        delete nextMemberUsernames[memberId];
        delete nextMemberAvatars[memberId];
        return {
          ...band,
          memberIds: nextMemberIds,
          memberRoles: nextMemberRoles,
          memberEmails: nextMemberEmails,
          memberUsernames: nextMemberUsernames,
          memberAvatars: nextMemberAvatars,
          updatedAt: new Date().toISOString(),
        };
      }));
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : 'Failed to remove band member.';
    }
  }, [userEmail, userId]);

  const leaveBand = useCallback(async (bandId: string) => {
    if (!userId) {
      return 'Bands require a signed-in account.';
    }
    return removeMember(bandId, userId);
  }, [removeMember, userId]);

  const addSongToBandLibrary = useCallback(async (bandId: string, song: Song) => {
    if (!db || !userId) {
      return 'Band libraries require cloud sync.';
    }

    const band = bands.find((entry) => entry.id === bandId);
    if (!band) {
      return 'Band not found.';
    }

    const role = band.ownerId === userId ? 'editor' : band.memberRoles[userId];
    if (role !== 'editor') {
      return 'You do not have permission to edit this band library.';
    }

    const songId = song.id || crypto.randomUUID();
    const currentBandSongs = bandSongsByBandId[bandId] ?? [];
    const nextSortOrder = currentBandSongs.reduce((max, entry) => {
      if (typeof entry.sortOrder !== 'number') return max;
      return Math.max(max, entry.sortOrder);
    }, -1) + 1;
    const { id, accessRole, ...rest } = song;
    const payload = Object.fromEntries(
      Object.entries({
        ...rest,
        sortOrder: nextSortOrder,
        ownerId: band.ownerId,
        collaboratorIds: band.memberIds,
        collaborationPermissions: Object.fromEntries(
          band.memberIds.map((memberId) => [memberId, band.memberRoles[memberId] ?? 'viewer'])
        ),
        updatedAt: new Date().toISOString(),
      }).filter(([, value]) => value !== undefined)
    );

    try {
      await setDoc(doc(db, BANDS_COLLECTION, bandId, BAND_SONGS_COLLECTION, songId), payload);
      await refreshBandSongs(bandId);
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : 'Failed to add song to band library.';
    }
  }, [bandSongsByBandId, bands, refreshBandSongs, userId]);

  const removeSongFromBandLibrary = useCallback(async (bandId: string, songId: string) => {
    if (!db || !userId) {
      return 'Band libraries require cloud sync.';
    }

    const band = bands.find((entry) => entry.id === bandId);
    if (!band) {
      return 'Band not found.';
    }

    const role = band.ownerId === userId ? 'editor' : band.memberRoles[userId];
    if (role !== 'editor') {
      return 'You do not have permission to edit this band library.';
    }

    try {
      await deleteDoc(doc(db, BANDS_COLLECTION, bandId, BAND_SONGS_COLLECTION, songId));
      setBandSongsByBandId((prev) => ({
        ...prev,
        [bandId]: (prev[bandId] ?? []).filter((song) => song.id !== songId),
      }));
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : 'Failed to remove song from band library.';
    }
  }, [bands, userId]);

  const moveBandSong = useCallback(async (bandId: string, songId: string, beforeSongId: string | null) => {
    if (!db || !userId) {
      return 'Band libraries require cloud sync.';
    }

    const firestore = db;

    const band = bands.find((entry) => entry.id === bandId);
    if (!band) {
      return 'Band not found.';
    }

    const role = band.ownerId === userId ? 'editor' : band.memberRoles[userId];
    if (role !== 'editor') {
      return 'You do not have permission to edit this band library.';
    }

    const previousSongs = bandSongsByBandId[bandId] ?? [];
    const reorderedSongs = moveSongInArray(previousSongs, songId, beforeSongId);
    if (reorderedSongs === previousSongs) {
      return null;
    }

    const nextSongs = withSequentialSortOrder(reorderedSongs);

    setBandSongsByBandId((prev) => ({
      ...prev,
      [bandId]: nextSongs,
    }));

    try {
      await Promise.all(
        nextSongs.map((song) => {
          const { id, accessRole, ...rest } = song;
          const payload = Object.fromEntries(
            Object.entries(rest).filter(([, value]) => value !== undefined)
          );
          return setDoc(doc(firestore, BANDS_COLLECTION, bandId, BAND_SONGS_COLLECTION, id), payload);
        })
      );
      return null;
    } catch (error) {
      setBandSongsByBandId((prev) => ({
        ...prev,
        [bandId]: previousSongs,
      }));
      return error instanceof Error ? error.message : 'Failed to reorder songs in band library.';
    }
  }, [bandSongsByBandId, bands, userId]);

  const value = useMemo<BandsContextValue>(() => ({
    bands,
    bandSongsByBandId,
    loading,
    cloudRequired: !firebaseEnabled,
    createBand,
    deleteBand,
    inviteMember,
    removeMember,
    leaveBand,
    refreshBandSongs,
    addSongToBandLibrary,
    removeSongFromBandLibrary,
    moveBandSong,
  }), [
    addSongToBandLibrary,
    bandSongsByBandId,
    bands,
    createBand,
    deleteBand,
    inviteMember,
    leaveBand,
    loading,
    moveBandSong,
    refreshBandSongs,
    removeMember,
    removeSongFromBandLibrary,
  ]);

  return <BandsContext.Provider value={value}>{children}</BandsContext.Provider>;
}

export function useBands() {
  const context = useContext(BandsContext);
  if (!context) {
    throw new Error('useBands must be used inside BandsProvider');
  }
  return context;
}