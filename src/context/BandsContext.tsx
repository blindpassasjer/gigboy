/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { collection, deleteDoc, doc, getDocs, query, setDoc, where } from 'firebase/firestore';
import type { Band, CollaborationPermission, Setlist, Song, SongList } from '../types';
import { db, firebaseEnabled } from '../lib/firebase';
import {
  changeBandMemberRoleOnServer,
  createBandOnServer,
  deleteBandOnServer,
  inviteBandMemberOnServer,
  removeBandMemberOnServer,
} from '../lib/bandsApi';
import { useAuth } from './AuthContext';

const BANDS_COLLECTION = 'bands';
const BAND_SONGS_COLLECTION = 'songs';
const BAND_SONGLISTS_COLLECTION = 'songLists';
const BAND_SETLISTS_COLLECTION = 'setlists';

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
    memberFullNames: typeof data.memberFullNames === 'object' && data.memberFullNames !== null
      ? Object.fromEntries(
          Object.entries(data.memberFullNames as Record<string, unknown>).filter(
            ([, fullName]) => typeof fullName === 'string'
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

function normalizeBandSongList(id: string, data: Record<string, unknown>): SongList {
  return {
    id,
    name: typeof data.name === 'string' ? data.name : 'Untitled songlist',
    songIds: Array.isArray(data.songIds)
      ? data.songIds.filter((entry): entry is string => typeof entry === 'string')
      : [],
    icon: typeof data.icon === 'string' ? data.icon : undefined,
    sortOrder: typeof data.sortOrder === 'number' ? data.sortOrder : undefined,
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

function normalizeBandSetlist(id: string, data: Record<string, unknown>): Setlist {
  return {
    id,
    name: typeof data.name === 'string' ? data.name : 'Untitled setlist',
    icon: typeof data.icon === 'string' ? data.icon : undefined,
    songIds: Array.isArray(data.songIds)
      ? data.songIds.filter((entry): entry is string => typeof entry === 'string')
      : [],
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

function sortBandSongLists(songLists: SongList[]) {
  return [...songLists].sort((a, b) => {
    const aSortOrder = typeof a.sortOrder === 'number' ? a.sortOrder : Number.MAX_SAFE_INTEGER;
    const bSortOrder = typeof b.sortOrder === 'number' ? b.sortOrder : Number.MAX_SAFE_INTEGER;
    if (aSortOrder !== bSortOrder) return aSortOrder - bSortOrder;
    return a.name.localeCompare(b.name);
  });
}

function sortBandSetlists(setlists: Setlist[]) {
  return [...setlists].sort((a, b) => {
    const aSortOrder = typeof a.sortOrder === 'number' ? a.sortOrder : Number.MAX_SAFE_INTEGER;
    const bSortOrder = typeof b.sortOrder === 'number' ? b.sortOrder : Number.MAX_SAFE_INTEGER;
    if (aSortOrder !== bSortOrder) return aSortOrder - bSortOrder;
    return a.name.localeCompare(b.name);
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

function withSequentialSongListSortOrder(songLists: SongList[]) {
  return songLists.map((songList, index) => ({ ...songList, sortOrder: index }));
}

function withSequentialSetlistSortOrder(setlists: Setlist[]) {
  return setlists.map((setlist, index) => ({ ...setlist, sortOrder: index }));
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

interface BandsContextValue {
  bands: Band[];
  bandSongsByBandId: Record<string, Song[]>;
  bandSongListsByBandId: Record<string, SongList[]>;
  bandSetlistsByBandId: Record<string, Setlist[]>;
  loading: boolean;
  cloudRequired: boolean;
  refreshBands: () => Promise<void>;
  createBand: (name: string, description?: string, icon?: string) => Promise<{ bandId: string | null; error: string | null }>;
  deleteBand: (bandId: string) => Promise<string | null>;
  renameBand: (bandId: string, name: string) => Promise<string | null>;
  inviteMember: (bandId: string, recipientUsername: string, role: CollaborationPermission) => Promise<string | null>;
  changeMemberRole: (bandId: string, memberId: string, role: CollaborationPermission) => Promise<string | null>;
  removeMember: (bandId: string, memberId: string) => Promise<string | null>;
  leaveBand: (bandId: string) => Promise<string | null>;
  refreshBandSongs: (bandId: string) => Promise<void>;
  refreshBandSongLists: (bandId: string) => Promise<void>;
  refreshBandSetlists: (bandId: string) => Promise<void>;
  addSongToBandLibrary: (bandId: string, song: Song) => Promise<string | null>;
  removeSongFromBandLibrary: (bandId: string, songId: string) => Promise<string | null>;
  moveBandSong: (bandId: string, songId: string, beforeSongId: string | null) => Promise<string | null>;
  addBandSongList: (bandId: string, name: string) => Promise<{ songListId: string | null; error: string | null }>;
  renameBandSongList: (bandId: string, songListId: string, name: string) => Promise<string | null>;
  updateBandSongListIcon: (bandId: string, songListId: string, icon?: string) => Promise<string | null>;
  updateBandLibraryIcon: (bandId: string, icon?: string) => Promise<string | null>;
  deleteBandSongList: (bandId: string, songListId: string) => Promise<string | null>;
  addSongToBandSongList: (bandId: string, songListId: string, songId: string) => Promise<string | null>;
  removeSongFromBandSongList: (bandId: string, songListId: string, songId: string) => Promise<string | null>;
  moveSongInBandSongList: (bandId: string, songListId: string, songId: string, beforeSongId: string | null) => Promise<string | null>;
  addBandSetlist: (bandId: string, name: string) => Promise<{ setlistId: string | null; error: string | null }>;
  renameBandSetlist: (bandId: string, setlistId: string, name: string) => Promise<string | null>;
  updateBandSetlistIcon: (bandId: string, setlistId: string, icon?: string) => Promise<string | null>;
  deleteBandSetlist: (bandId: string, setlistId: string) => Promise<string | null>;
  addSongToBandSetlist: (bandId: string, setlistId: string, songId: string) => Promise<string | null>;
  removeSongFromBandSetlist: (bandId: string, setlistId: string, songId: string) => Promise<string | null>;
  moveSongInBandSetlist: (bandId: string, setlistId: string, songId: string, beforeSongId: string | null) => Promise<string | null>;
}

const BandsContext = createContext<BandsContextValue | null>(null);

export function BandsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const userEmail = user?.email ?? '';
  const userUsername = user?.username ?? '';
  const userFullName = user?.fullName ?? '';
  const userAvatar = user?.avatar ?? '';
  const [bands, setBands] = useState<Band[]>([]);
  const [bandSongsByBandId, setBandSongsByBandId] = useState<Record<string, Song[]>>({});
  const [bandSongListsByBandId, setBandSongListsByBandId] = useState<Record<string, SongList[]>>({});
  const [bandSetlistsByBandId, setBandSetlistsByBandId] = useState<Record<string, Setlist[]>>({});
  const [loading, setLoading] = useState(firebaseEnabled);

  const refreshBands = useCallback(async () => {
    if (!db || !userId) {
      setBands([]);
      return;
    }

    const snapshot = await getDocs(query(collection(db, BANDS_COLLECTION), where('memberIds', 'array-contains', userId)));
    const nextBands = snapshot.docs
      .map((entry) => normalizeBand(entry.id, entry.data() as Record<string, unknown>))
      .sort(compareBands);
    setBands(nextBands);
  }, [userId]);

  useEffect(() => {
    if (!db || !userId) {
      setBands([]);
      setBandSongsByBandId({});
      setBandSongListsByBandId({});
      setBandSetlistsByBandId({});
      setLoading(false);
      return;
    }

    setLoading(true);

    refreshBands()
      .catch((error) => {
        console.error('Failed to load bands from Firestore.', error);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [refreshBands, userId]);

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

  const refreshBandSongLists = useCallback(async (bandId: string) => {
    if (!db || !userId) return;

    const snapshot = await getDocs(collection(db, BANDS_COLLECTION, bandId, BAND_SONGLISTS_COLLECTION));
    const songLists = sortBandSongLists(
      snapshot.docs.map((entry) => normalizeBandSongList(entry.id, entry.data() as Record<string, unknown>))
    );

    setBandSongListsByBandId((prev) => ({
      ...prev,
      [bandId]: songLists,
    }));
  }, [userId]);

  const refreshBandSetlists = useCallback(async (bandId: string) => {
    if (!db || !userId) return;

    const snapshot = await getDocs(collection(db, BANDS_COLLECTION, bandId, BAND_SETLISTS_COLLECTION));
    const setlists = sortBandSetlists(
      snapshot.docs.map((entry) => normalizeBandSetlist(entry.id, entry.data() as Record<string, unknown>))
    );

    setBandSetlistsByBandId((prev) => ({
      ...prev,
      [bandId]: setlists,
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
          memberFullNames: userFullName ? { [userId]: userFullName } : {},
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
  }, [userAvatar, userEmail, userFullName, userId, userUsername]);

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
      setBandSongListsByBandId((prev) => {
        const next = { ...prev };
        delete next[bandId];
        return next;
      });
      setBandSetlistsByBandId((prev) => {
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
        const songListsSnapshot = await getDocs(collection(db, BANDS_COLLECTION, bandId, BAND_SONGLISTS_COLLECTION));
        const setlistsSnapshot = await getDocs(collection(db, BANDS_COLLECTION, bandId, BAND_SETLISTS_COLLECTION));
        await Promise.all(songsSnapshot.docs.map((entry) => deleteDoc(entry.ref)));
        await Promise.all(songListsSnapshot.docs.map((entry) => deleteDoc(entry.ref)));
        await Promise.all(setlistsSnapshot.docs.map((entry) => deleteDoc(entry.ref)));
        await deleteDoc(doc(db, BANDS_COLLECTION, bandId));

        setBands((prev) => prev.filter((entry) => entry.id !== bandId));
        setBandSongsByBandId((prev) => {
          const next = { ...prev };
          delete next[bandId];
          return next;
        });
        setBandSongListsByBandId((prev) => {
          const next = { ...prev };
          delete next[bandId];
          return next;
        });
        setBandSetlistsByBandId((prev) => {
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

  const renameBand = useCallback(async (bandId: string, name: string) => {
    if (!db || !userId) {
      return 'Bands require cloud sync.';
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      return 'Band name is required.';
    }

    const band = bands.find((entry) => entry.id === bandId);
    if (!band) {
      return 'Band not found.';
    }

    const role = band.ownerId === userId ? 'editor' : band.memberRoles[userId];
    if (role !== 'editor') {
      return 'You do not have permission to edit this band.';
    }

    const previousBands = bands;
    const now = new Date().toISOString();
    const nextBands = bands
      .map((entry) => (entry.id === bandId ? { ...entry, name: trimmedName, updatedAt: now } : entry))
      .sort(compareBands);

    setBands(nextBands);

    try {
      await setDoc(doc(db, BANDS_COLLECTION, bandId), {
        name: trimmedName,
        updatedAt: now,
      }, { merge: true });
      return null;
    } catch (error) {
      setBands(previousBands);
      return error instanceof Error ? error.message : 'Failed to rename band.';
    }
  }, [bands, userId]);

  const updateBandLibraryIcon = useCallback(async (bandId: string, icon?: string) => {
    if (!db || !userId) {
      return 'Bands require cloud sync.';
    }

    const band = bands.find((entry) => entry.id === bandId);
    if (!band) {
      return 'Band not found.';
    }

    const role = band.ownerId === userId ? 'editor' : band.memberRoles[userId];
    if (role !== 'editor') {
      return 'You do not have permission to edit this band.';
    }

    const previousBands = bands;
    const now = new Date().toISOString();
    const nextBands = bands
      .map((entry) => (entry.id === bandId ? { ...entry, icon, updatedAt: now } : entry))
      .sort(compareBands);

    setBands(nextBands);

    try {
      await setDoc(doc(db, BANDS_COLLECTION, bandId), {
        icon,
        updatedAt: now,
      }, { merge: true });
      return null;
    } catch (error) {
      setBands(previousBands);
      return error instanceof Error ? error.message : 'Failed to update band library icon.';
    }
  }, [bands, userId]);

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

  const changeMemberRole = useCallback(async (bandId: string, memberId: string, role: CollaborationPermission) => {
    if (!userId) {
      return 'Bands require a signed-in account.';
    }

    try {
      await changeBandMemberRoleOnServer({ userId, userEmail, bandId, memberId, role });
      setBands((prev) => prev.map((band) => {
        if (band.id !== bandId) return band;
        return {
          ...band,
          memberRoles: { ...band.memberRoles, [memberId]: role },
          updatedAt: new Date().toISOString(),
        };
      }));
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : 'Failed to change member role.';
    }
  }, [userEmail, userId]);

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
        const nextMemberFullNames = { ...band.memberFullNames };
        const nextMemberAvatars = { ...band.memberAvatars };
        delete nextMemberRoles[memberId];
        delete nextMemberEmails[memberId];
        delete nextMemberUsernames[memberId];
        delete nextMemberFullNames[memberId];
        delete nextMemberAvatars[memberId];
        return {
          ...band,
          memberIds: nextMemberIds,
          memberRoles: nextMemberRoles,
          memberEmails: nextMemberEmails,
          memberUsernames: nextMemberUsernames,
          memberFullNames: nextMemberFullNames,
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

  const addBandSongList = useCallback(async (bandId: string, name: string) => {
    if (!db || !userId) {
      return { songListId: null, error: 'Band songlists require cloud sync.' };
    }

    const band = bands.find((entry) => entry.id === bandId);
    if (!band) {
      return { songListId: null, error: 'Band not found.' };
    }

    const role = band.ownerId === userId ? 'editor' : band.memberRoles[userId];
    if (role !== 'editor') {
      return { songListId: null, error: 'You do not have permission to edit this band.' };
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      return { songListId: null, error: 'Songlist name is required.' };
    }

    const songListId = crypto.randomUUID();
    const currentSongLists = bandSongListsByBandId[bandId] ?? [];
    const nextSongList: SongList = {
      id: songListId,
      name: trimmedName,
      songIds: [],
      sortOrder: currentSongLists.length,
      ownerId: band.ownerId,
      collaboratorIds: band.memberIds,
      collaborationPermissions: Object.fromEntries(
        band.memberIds.map((memberId) => [memberId, band.memberRoles[memberId] ?? 'viewer'])
      ),
      accessRole: 'owner',
    };

    try {
      const { id, accessRole, ...payload } = nextSongList;
      await setDoc(doc(db, BANDS_COLLECTION, bandId, BAND_SONGLISTS_COLLECTION, songListId), payload);
      await refreshBandSongLists(bandId);
      return { songListId, error: null };
    } catch (error) {
      return {
        songListId: null,
        error: error instanceof Error ? error.message : 'Failed to create band songlist.',
      };
    }
  }, [bandSongListsByBandId, bands, refreshBandSongLists, userId]);

  const renameBandSongList = useCallback(async (bandId: string, songListId: string, name: string) => {
    if (!db || !userId) {
      return 'Band songlists require cloud sync.';
    }

    const band = bands.find((entry) => entry.id === bandId);
    if (!band) return 'Band not found.';

    const role = band.ownerId === userId ? 'editor' : band.memberRoles[userId];
    if (role !== 'editor') {
      return 'You do not have permission to edit this band.';
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      return 'Songlist name is required.';
    }

    const previousSongLists = bandSongListsByBandId[bandId] ?? [];
    const nextSongLists = previousSongLists.map((songList) => (
      songList.id === songListId ? { ...songList, name: trimmedName } : songList
    ));

    setBandSongListsByBandId((prev) => ({
      ...prev,
      [bandId]: nextSongLists,
    }));

    try {
      await setDoc(doc(db, BANDS_COLLECTION, bandId, BAND_SONGLISTS_COLLECTION, songListId), {
        name: trimmedName,
      }, { merge: true });
      return null;
    } catch (error) {
      setBandSongListsByBandId((prev) => ({
        ...prev,
        [bandId]: previousSongLists,
      }));
      return error instanceof Error ? error.message : 'Failed to rename band songlist.';
    }
  }, [bandSongListsByBandId, bands, userId]);

  const updateBandSongListIcon = useCallback(async (bandId: string, songListId: string, icon?: string) => {
    if (!db || !userId) {
      return 'Band songlists require cloud sync.';
    }

    const band = bands.find((entry) => entry.id === bandId);
    if (!band) return 'Band not found.';

    const role = band.ownerId === userId ? 'editor' : band.memberRoles[userId];
    if (role !== 'editor') {
      return 'You do not have permission to edit this band.';
    }

    const previousSongLists = bandSongListsByBandId[bandId] ?? [];
    const nextSongLists = previousSongLists.map((songList) => (
      songList.id === songListId ? { ...songList, icon } : songList
    ));

    setBandSongListsByBandId((prev) => ({
      ...prev,
      [bandId]: nextSongLists,
    }));

    try {
      await setDoc(doc(db, BANDS_COLLECTION, bandId, BAND_SONGLISTS_COLLECTION, songListId), {
        icon,
      }, { merge: true });
      return null;
    } catch (error) {
      setBandSongListsByBandId((prev) => ({
        ...prev,
        [bandId]: previousSongLists,
      }));
      return error instanceof Error ? error.message : 'Failed to update band songlist icon.';
    }
  }, [bandSongListsByBandId, bands, userId]);

  const deleteBandSongList = useCallback(async (bandId: string, songListId: string) => {
    if (!db || !userId) {
      return 'Band songlists require cloud sync.';
    }

    const firestore = db;

    const band = bands.find((entry) => entry.id === bandId);
    if (!band) return 'Band not found.';

    const role = band.ownerId === userId ? 'editor' : band.memberRoles[userId];
    if (role !== 'editor') {
      return 'You do not have permission to edit this band.';
    }

    const previousSongLists = bandSongListsByBandId[bandId] ?? [];
    const nextSongLists = withSequentialSongListSortOrder(
      previousSongLists.filter((songList) => songList.id !== songListId)
    );

    setBandSongListsByBandId((prev) => ({
      ...prev,
      [bandId]: nextSongLists,
    }));

    try {
      await Promise.all([
        deleteDoc(doc(firestore, BANDS_COLLECTION, bandId, BAND_SONGLISTS_COLLECTION, songListId)),
        ...nextSongLists.map((songList) => setDoc(
          doc(firestore, BANDS_COLLECTION, bandId, BAND_SONGLISTS_COLLECTION, songList.id),
          { sortOrder: songList.sortOrder ?? 0 },
          { merge: true }
        )),
      ]);
      return null;
    } catch (error) {
      setBandSongListsByBandId((prev) => ({
        ...prev,
        [bandId]: previousSongLists,
      }));
      return error instanceof Error ? error.message : 'Failed to delete band songlist.';
    }
  }, [bandSongListsByBandId, bands, userId]);

  const addSongToBandSongList = useCallback(async (bandId: string, songListId: string, songId: string) => {
    if (!db || !userId) {
      return 'Band songlists require cloud sync.';
    }

    const band = bands.find((entry) => entry.id === bandId);
    if (!band) return 'Band not found.';

    const role = band.ownerId === userId ? 'editor' : band.memberRoles[userId];
    if (role !== 'editor') return 'You do not have permission to edit this band.';

    const previousSongLists = bandSongListsByBandId[bandId] ?? [];
    const targetSongList = previousSongLists.find((songList) => songList.id === songListId);
    if (!targetSongList || targetSongList.songIds.includes(songId)) {
      return null;
    }

    const nextSongList = { ...targetSongList, songIds: [...targetSongList.songIds, songId] };
    const nextSongLists = previousSongLists.map((songList) => (
      songList.id === songListId ? nextSongList : songList
    ));

    setBandSongListsByBandId((prev) => ({
      ...prev,
      [bandId]: nextSongLists,
    }));

    try {
      await setDoc(doc(db, BANDS_COLLECTION, bandId, BAND_SONGLISTS_COLLECTION, songListId), {
        songIds: nextSongList.songIds,
      }, { merge: true });
      return null;
    } catch (error) {
      setBandSongListsByBandId((prev) => ({
        ...prev,
        [bandId]: previousSongLists,
      }));
      return error instanceof Error ? error.message : 'Failed to update band songlist.';
    }
  }, [bandSongListsByBandId, bands, userId]);

  const removeSongFromBandSongList = useCallback(async (bandId: string, songListId: string, songId: string) => {
    if (!db || !userId) {
      return 'Band songlists require cloud sync.';
    }

    const band = bands.find((entry) => entry.id === bandId);
    if (!band) return 'Band not found.';

    const role = band.ownerId === userId ? 'editor' : band.memberRoles[userId];
    if (role !== 'editor') return 'You do not have permission to edit this band.';

    const previousSongLists = bandSongListsByBandId[bandId] ?? [];
    const targetSongList = previousSongLists.find((songList) => songList.id === songListId);
    if (!targetSongList) return null;

    const nextSongList = {
      ...targetSongList,
      songIds: targetSongList.songIds.filter((entry) => entry !== songId),
    };
    const nextSongLists = previousSongLists.map((songList) => (
      songList.id === songListId ? nextSongList : songList
    ));

    setBandSongListsByBandId((prev) => ({
      ...prev,
      [bandId]: nextSongLists,
    }));

    try {
      await setDoc(doc(db, BANDS_COLLECTION, bandId, BAND_SONGLISTS_COLLECTION, songListId), {
        songIds: nextSongList.songIds,
      }, { merge: true });
      return null;
    } catch (error) {
      setBandSongListsByBandId((prev) => ({
        ...prev,
        [bandId]: previousSongLists,
      }));
      return error instanceof Error ? error.message : 'Failed to update band songlist.';
    }
  }, [bandSongListsByBandId, bands, userId]);

  const moveSongInBandSongList = useCallback(async (bandId: string, songListId: string, songId: string, beforeSongId: string | null) => {
    if (!db || !userId) {
      return 'Band songlists require cloud sync.';
    }

    const band = bands.find((entry) => entry.id === bandId);
    if (!band) return 'Band not found.';

    const role = band.ownerId === userId ? 'editor' : band.memberRoles[userId];
    if (role !== 'editor') return 'You do not have permission to edit this band.';

    const previousSongLists = bandSongListsByBandId[bandId] ?? [];
    const targetSongList = previousSongLists.find((songList) => songList.id === songListId);
    if (!targetSongList) return null;

    const nextSongIds = moveSongId(targetSongList.songIds, songId, beforeSongId);
    if (nextSongIds === targetSongList.songIds) {
      return null;
    }

    const nextSongList = { ...targetSongList, songIds: nextSongIds };
    const nextSongLists = previousSongLists.map((songList) => (
      songList.id === songListId ? nextSongList : songList
    ));

    setBandSongListsByBandId((prev) => ({
      ...prev,
      [bandId]: nextSongLists,
    }));

    try {
      await setDoc(doc(db, BANDS_COLLECTION, bandId, BAND_SONGLISTS_COLLECTION, songListId), {
        songIds: nextSongIds,
      }, { merge: true });
      return null;
    } catch (error) {
      setBandSongListsByBandId((prev) => ({
        ...prev,
        [bandId]: previousSongLists,
      }));
      return error instanceof Error ? error.message : 'Failed to reorder band songlist.';
    }
  }, [bandSongListsByBandId, bands, userId]);

  const addBandSetlist = useCallback(async (bandId: string, name: string) => {
    if (!db || !userId) {
      return { setlistId: null, error: 'Band setlists require cloud sync.' };
    }

    const band = bands.find((entry) => entry.id === bandId);
    if (!band) {
      return { setlistId: null, error: 'Band not found.' };
    }

    const role = band.ownerId === userId ? 'editor' : band.memberRoles[userId];
    if (role !== 'editor') {
      return { setlistId: null, error: 'You do not have permission to edit this band.' };
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      return { setlistId: null, error: 'Setlist name is required.' };
    }

    const setlistId = crypto.randomUUID();
    const now = new Date().toISOString();
    const currentSetlists = bandSetlistsByBandId[bandId] ?? [];
    const nextSetlist: Setlist = {
      id: setlistId,
      name: trimmedName,
      songIds: [],
      sortOrder: currentSetlists.length,
      createdAt: now,
      updatedAt: now,
      ownerId: band.ownerId,
      collaboratorIds: band.memberIds,
      collaborationPermissions: Object.fromEntries(
        band.memberIds.map((memberId) => [memberId, band.memberRoles[memberId] ?? 'viewer'])
      ),
      accessRole: 'owner',
    };

    try {
      const { id, accessRole, ...payload } = nextSetlist;
      await setDoc(doc(db, BANDS_COLLECTION, bandId, BAND_SETLISTS_COLLECTION, setlistId), payload);
      await refreshBandSetlists(bandId);
      return { setlistId, error: null };
    } catch (error) {
      return {
        setlistId: null,
        error: error instanceof Error ? error.message : 'Failed to create band setlist.',
      };
    }
  }, [bandSetlistsByBandId, bands, refreshBandSetlists, userId]);

  const renameBandSetlist = useCallback(async (bandId: string, setlistId: string, name: string) => {
    if (!db || !userId) {
      return 'Band setlists require cloud sync.';
    }

    const band = bands.find((entry) => entry.id === bandId);
    if (!band) return 'Band not found.';

    const role = band.ownerId === userId ? 'editor' : band.memberRoles[userId];
    if (role !== 'editor') return 'You do not have permission to edit this band.';

    const trimmedName = name.trim();
    if (!trimmedName) return 'Setlist name is required.';

    const previousSetlists = bandSetlistsByBandId[bandId] ?? [];
    const now = new Date().toISOString();
    const nextSetlists = previousSetlists.map((setlist) => (
      setlist.id === setlistId ? { ...setlist, name: trimmedName, updatedAt: now } : setlist
    ));

    setBandSetlistsByBandId((prev) => ({
      ...prev,
      [bandId]: nextSetlists,
    }));

    try {
      await setDoc(doc(db, BANDS_COLLECTION, bandId, BAND_SETLISTS_COLLECTION, setlistId), {
        name: trimmedName,
        updatedAt: now,
      }, { merge: true });
      return null;
    } catch (error) {
      setBandSetlistsByBandId((prev) => ({
        ...prev,
        [bandId]: previousSetlists,
      }));
      return error instanceof Error ? error.message : 'Failed to rename band setlist.';
    }
  }, [bandSetlistsByBandId, bands, userId]);

  const updateBandSetlistIcon = useCallback(async (bandId: string, setlistId: string, icon?: string) => {
    if (!db || !userId) {
      return 'Band setlists require cloud sync.';
    }

    const band = bands.find((entry) => entry.id === bandId);
    if (!band) return 'Band not found.';

    const role = band.ownerId === userId ? 'editor' : band.memberRoles[userId];
    if (role !== 'editor') return 'You do not have permission to edit this band.';

    const previousSetlists = bandSetlistsByBandId[bandId] ?? [];
    const now = new Date().toISOString();
    const nextSetlists = previousSetlists.map((setlist) => (
      setlist.id === setlistId ? { ...setlist, icon, updatedAt: now } : setlist
    ));

    setBandSetlistsByBandId((prev) => ({
      ...prev,
      [bandId]: nextSetlists,
    }));

    try {
      await setDoc(doc(db, BANDS_COLLECTION, bandId, BAND_SETLISTS_COLLECTION, setlistId), {
        icon,
        updatedAt: now,
      }, { merge: true });
      return null;
    } catch (error) {
      setBandSetlistsByBandId((prev) => ({
        ...prev,
        [bandId]: previousSetlists,
      }));
      return error instanceof Error ? error.message : 'Failed to update band setlist icon.';
    }
  }, [bandSetlistsByBandId, bands, userId]);

  const deleteBandSetlist = useCallback(async (bandId: string, setlistId: string) => {
    if (!db || !userId) {
      return 'Band setlists require cloud sync.';
    }

    const firestore = db;

    const band = bands.find((entry) => entry.id === bandId);
    if (!band) return 'Band not found.';

    const role = band.ownerId === userId ? 'editor' : band.memberRoles[userId];
    if (role !== 'editor') {
      return 'You do not have permission to edit this band.';
    }

    const previousSetlists = bandSetlistsByBandId[bandId] ?? [];
    const nextSetlists = withSequentialSetlistSortOrder(
      previousSetlists.filter((setlist) => setlist.id !== setlistId)
    );

    setBandSetlistsByBandId((prev) => ({
      ...prev,
      [bandId]: nextSetlists,
    }));

    try {
      await Promise.all([
        deleteDoc(doc(firestore, BANDS_COLLECTION, bandId, BAND_SETLISTS_COLLECTION, setlistId)),
        ...nextSetlists.map((setlist) => setDoc(
          doc(firestore, BANDS_COLLECTION, bandId, BAND_SETLISTS_COLLECTION, setlist.id),
          { sortOrder: setlist.sortOrder ?? 0 },
          { merge: true }
        )),
      ]);
      return null;
    } catch (error) {
      setBandSetlistsByBandId((prev) => ({
        ...prev,
        [bandId]: previousSetlists,
      }));
      return error instanceof Error ? error.message : 'Failed to delete band setlist.';
    }
  }, [bandSetlistsByBandId, bands, userId]);

  const addSongToBandSetlist = useCallback(async (bandId: string, setlistId: string, songId: string) => {
    if (!db || !userId) {
      return 'Band setlists require cloud sync.';
    }

    const band = bands.find((entry) => entry.id === bandId);
    if (!band) return 'Band not found.';

    const role = band.ownerId === userId ? 'editor' : band.memberRoles[userId];
    if (role !== 'editor') return 'You do not have permission to edit this band.';

    const previousSetlists = bandSetlistsByBandId[bandId] ?? [];
    const targetSetlist = previousSetlists.find((setlist) => setlist.id === setlistId);
    if (!targetSetlist || targetSetlist.songIds.includes(songId)) return null;

    const now = new Date().toISOString();
    const nextSetlist = {
      ...targetSetlist,
      songIds: [...targetSetlist.songIds, songId],
      updatedAt: now,
    };
    const nextSetlists = previousSetlists.map((setlist) => (
      setlist.id === setlistId ? nextSetlist : setlist
    ));

    setBandSetlistsByBandId((prev) => ({
      ...prev,
      [bandId]: nextSetlists,
    }));

    try {
      await setDoc(doc(db, BANDS_COLLECTION, bandId, BAND_SETLISTS_COLLECTION, setlistId), {
        songIds: nextSetlist.songIds,
        updatedAt: now,
      }, { merge: true });
      return null;
    } catch (error) {
      setBandSetlistsByBandId((prev) => ({
        ...prev,
        [bandId]: previousSetlists,
      }));
      return error instanceof Error ? error.message : 'Failed to update band setlist.';
    }
  }, [bandSetlistsByBandId, bands, userId]);

  const removeSongFromBandSetlist = useCallback(async (bandId: string, setlistId: string, songId: string) => {
    if (!db || !userId) {
      return 'Band setlists require cloud sync.';
    }

    const band = bands.find((entry) => entry.id === bandId);
    if (!band) return 'Band not found.';

    const role = band.ownerId === userId ? 'editor' : band.memberRoles[userId];
    if (role !== 'editor') return 'You do not have permission to edit this band.';

    const previousSetlists = bandSetlistsByBandId[bandId] ?? [];
    const targetSetlist = previousSetlists.find((setlist) => setlist.id === setlistId);
    if (!targetSetlist) return null;

    const now = new Date().toISOString();
    const nextSetlist = {
      ...targetSetlist,
      songIds: targetSetlist.songIds.filter((entry) => entry !== songId),
      updatedAt: now,
    };
    const nextSetlists = previousSetlists.map((setlist) => (
      setlist.id === setlistId ? nextSetlist : setlist
    ));

    setBandSetlistsByBandId((prev) => ({
      ...prev,
      [bandId]: nextSetlists,
    }));

    try {
      await setDoc(doc(db, BANDS_COLLECTION, bandId, BAND_SETLISTS_COLLECTION, setlistId), {
        songIds: nextSetlist.songIds,
        updatedAt: now,
      }, { merge: true });
      return null;
    } catch (error) {
      setBandSetlistsByBandId((prev) => ({
        ...prev,
        [bandId]: previousSetlists,
      }));
      return error instanceof Error ? error.message : 'Failed to update band setlist.';
    }
  }, [bandSetlistsByBandId, bands, userId]);

  const moveSongInBandSetlist = useCallback(async (bandId: string, setlistId: string, songId: string, beforeSongId: string | null) => {
    if (!db || !userId) {
      return 'Band setlists require cloud sync.';
    }

    const band = bands.find((entry) => entry.id === bandId);
    if (!band) return 'Band not found.';

    const role = band.ownerId === userId ? 'editor' : band.memberRoles[userId];
    if (role !== 'editor') return 'You do not have permission to edit this band.';

    const previousSetlists = bandSetlistsByBandId[bandId] ?? [];
    const targetSetlist = previousSetlists.find((setlist) => setlist.id === setlistId);
    if (!targetSetlist) return null;

    const nextSongIds = moveSongId(targetSetlist.songIds, songId, beforeSongId);
    if (nextSongIds === targetSetlist.songIds) {
      return null;
    }

    const now = new Date().toISOString();
    const nextSetlist = { ...targetSetlist, songIds: nextSongIds, updatedAt: now };
    const nextSetlists = previousSetlists.map((setlist) => (
      setlist.id === setlistId ? nextSetlist : setlist
    ));

    setBandSetlistsByBandId((prev) => ({
      ...prev,
      [bandId]: nextSetlists,
    }));

    try {
      await setDoc(doc(db, BANDS_COLLECTION, bandId, BAND_SETLISTS_COLLECTION, setlistId), {
        songIds: nextSongIds,
        updatedAt: now,
      }, { merge: true });
      return null;
    } catch (error) {
      setBandSetlistsByBandId((prev) => ({
        ...prev,
        [bandId]: previousSetlists,
      }));
      return error instanceof Error ? error.message : 'Failed to reorder band setlist.';
    }
  }, [bandSetlistsByBandId, bands, userId]);

  const value = useMemo<BandsContextValue>(() => ({
    bands,
    bandSongsByBandId,
    bandSongListsByBandId,
    bandSetlistsByBandId,
    loading,
    cloudRequired: !firebaseEnabled,
    refreshBands,
    createBand,
    deleteBand,
    renameBand,
    inviteMember,
    changeMemberRole,
    removeMember,
    leaveBand,
    refreshBandSongs,
    refreshBandSongLists,
    refreshBandSetlists,
    addSongToBandLibrary,
    removeSongFromBandLibrary,
    updateBandLibraryIcon,
    moveBandSong,
    addBandSongList,
    renameBandSongList,
    updateBandSongListIcon,
    deleteBandSongList,
    addSongToBandSongList,
    removeSongFromBandSongList,
    moveSongInBandSongList,
    addBandSetlist,
    renameBandSetlist,
    updateBandSetlistIcon,
    deleteBandSetlist,
    addSongToBandSetlist,
    removeSongFromBandSetlist,
    moveSongInBandSetlist,
  }), [
    addBandSetlist,
    addBandSongList,
    addSongToBandSetlist,
    addSongToBandSongList,
    addSongToBandLibrary,
    bandSetlistsByBandId,
    bandSongListsByBandId,
    bandSongsByBandId,
    bands,
    changeMemberRole,
    refreshBands,
    createBand,
    deleteBandSetlist,
    deleteBandSongList,
    deleteBand,
    inviteMember,
    leaveBand,
    loading,
    moveSongInBandSetlist,
    moveSongInBandSongList,
    moveBandSong,
    refreshBandSetlists,
    refreshBandSongLists,
    renameBand,
    renameBandSetlist,
    renameBandSongList,
    updateBandSongListIcon,
    refreshBandSongs,
    removeMember,
    removeSongFromBandSetlist,
    removeSongFromBandSongList,
    removeSongFromBandLibrary,
    updateBandLibraryIcon,
    updateBandSetlistIcon,
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