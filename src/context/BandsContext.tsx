/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { collection, deleteDoc, deleteField, doc, getDoc, getDocs, onSnapshot, query, setDoc, where } from 'firebase/firestore';
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import type {
  Band,
  SongHandNoteDocument,
  PublicSongEntry,
  Setlist,
  Song,
  SongList,
  StageplotItem,
  InputList,
  PressKit,
  TrashedSetlist,
  TrashedSong,
  TrashedSongList,
  TrashedInputList,
  TrashedPressKit,
  TrashedPressKitImage,
  TrashedBandLogo,
  TrashedAttachment,
} from '../types';
import { db, storage, firebaseEnabled } from '../lib/firebase';
import {
  repairBandMembershipOnServer,
} from '../lib/bandsApi';
import {
  compareTrashByDeletedAtDesc,
  createTrashPayload,
  createTrashTimestamps,
  isTrashExpired,
  parseSetlistTrashRecord,
  parseSongListTrashRecord,
  parseSongTrashRecord,
  parseInputListTrashRecord,
  parsePressKitTrashRecord,
  parsePressKitImageTrashRecord,
  parseBandLogoTrashRecord,
  parseAttachmentTrashRecord,
  TRASH_COLLECTION,
} from '../lib/trash';
import {
  sortInputLists,
  withSequentialInputListSortOrder,
} from '../lib/inputLists';
import { useAuth } from './AuthContext';
import { moveIdBefore } from '../utils/arrayUtils';
import { createWebpThumbnail } from '../utils/imageThumbnail';
import { bandCanUse, resolveResourceLimit, PLAN_LIMITS } from '../lib/planLimits';
import { dataClient } from '../lib/dataClient';
import {
  BANDS_COLLECTION,
  BAND_SETLISTS_COLLECTION,
  compareBands,
  mergeBandsById,
  normalizeBand,
} from '../lib/dataClient/firebaseClient';

const isSelfHost = import.meta.env.VITE_BACKEND === 'selfhost';
const BAND_PRESS_KITS_COLLECTION = 'pressKits';
const MIGRATION_MARKER_PREFIX = 'gigboy-bands-migration';
const SERVER_REPAIR_MARKER = 'server-repair-v1';
const CLIENT_REPAIR_MARKER = 'client-repair-v1';

/** Strip keys with undefined values so Firestore doesn't reject the document. */
function stripUndefinedFields<T extends object>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj as Record<string, unknown>).filter(([, v]) => v !== undefined),
  ) as T;
}

function migrationMarkerKey(marker: string, userId: string) {
  return `${MIGRATION_MARKER_PREFIX}:${marker}:${userId}`;
}

function hasMigrationMarker(marker: string, userId: string) {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(migrationMarkerKey(marker, userId)) === '1';
  } catch {
    return false;
  }
}

function setMigrationMarker(marker: string, userId: string) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(migrationMarkerKey(marker, userId), '1');
  } catch {
    // Ignore storage write failures to keep app flow non-blocking.
  }
}

function canEditBandLibrary(band: Band, userId: string | null) {
  if (!userId) return false;
  return band.ownerId === userId || band.memberRoles[userId] === 'editor';
}

function sortBandSongs(songs: Song[]) {
  return [...songs].sort((a, b) => {
    const aSortOrder = typeof a.sortOrder === 'number' ? a.sortOrder : Number.MAX_SAFE_INTEGER;
    const bSortOrder = typeof b.sortOrder === 'number' ? b.sortOrder : Number.MAX_SAFE_INTEGER;
    if (aSortOrder !== bSortOrder) return aSortOrder - bSortOrder;
    return a.title.localeCompare(b.title);
  });
}

function sortBandSongLists(songLists: SongList[]) {
  return [...songLists].sort((a, b) => {
    const aSortOrder = typeof a.sortOrder === 'number' ? a.sortOrder : Number.MAX_SAFE_INTEGER;
    const bSortOrder = typeof b.sortOrder === 'number' ? b.sortOrder : Number.MAX_SAFE_INTEGER;
    if (aSortOrder !== bSortOrder) return aSortOrder - bSortOrder;
    return a.name.localeCompare(b.name);
  });
}

function buildPublicSongs(songIds: string[], songs: Song[]): PublicSongEntry[] {
  const songsById = new Map(songs.map((song) => [song.id, song]));
  return songIds
    .map((songId) => songsById.get(songId))
    .filter((song): song is Song => song !== undefined)
    .map((song) => ({ id: song.id, title: song.title, ...(song.artist ? { artist: song.artist } : {}) }));
}

function sortBandSetlists(setlists: Setlist[]) {  return [...setlists].sort((a, b) => {
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

type BandTrashItem =
  | (TrashedSong & { bandId: string })
  | (TrashedSongList & { bandId: string })
  | (TrashedSetlist & { bandId: string })
  | (TrashedInputList & { bandId: string })
  | (TrashedPressKit & { bandId: string })
  | (TrashedPressKitImage & { bandId: string })
  | (TrashedBandLogo & { bandId: string })
  | (TrashedAttachment & { bandId: string });

interface BandsContextValue {
  bands: Band[];
  bandSongsByBandId: Record<string, Song[]>;
  bandSongListsByBandId: Record<string, SongList[]>;
  bandSetlistsByBandId: Record<string, Setlist[]>;
  bandInputListsByBandId: Record<string, InputList[]>;
  bandPressKitsByBandId: Record<string, PressKit[]>;
  bandTrashByBandId: Record<string, BandTrashItem[]>;
  loading: boolean;
  cloudRequired: boolean;
  refreshBands: () => Promise<void>;
  createBand: (name: string, description?: string, icon?: string) => Promise<{ bandId: string | null; error: string | null }>;
  deleteBand: (bandId: string) => Promise<string | null>;
  renameBand: (bandId: string, name: string) => Promise<string | null>;
  updateBandDescription: (bandId: string, description: string) => Promise<string | null>;
  removeMember: (bandId: string, memberId: string) => Promise<string | null>;
  leaveBand: (bandId: string) => Promise<string | null>;
  refreshBandSongs: (bandId: string) => Promise<void>;
  refreshBandSongLists: (bandId: string) => Promise<void>;
  refreshBandSetlists: (bandId: string) => Promise<void>;
  refreshBandInputLists: (bandId: string) => Promise<void>;
  refreshBandPressKits: (bandId: string) => Promise<void>;
  refreshBandTrash: (bandId: string) => Promise<void>;
  addSongToBandLibrary: (bandId: string, song: Song) => Promise<string | null>;
  updateBandSong: (bandId: string, song: Song) => Promise<string | null>;
  removeSongFromBandLibrary: (bandId: string, songId: string) => Promise<string | null>;
  moveBandSong: (bandId: string, songId: string, beforeSongId: string | null) => Promise<string | null>;
  addBandSongList: (bandId: string, name: string) => Promise<{ songListId: string | null; error: string | null }>;
  renameBandSongList: (bandId: string, songListId: string, name: string) => Promise<string | null>;
  updateBandSongListIcon: (bandId: string, songListId: string, icon?: string) => Promise<string | null>;
  updateBandLibraryAppearance: (bandId: string, appearance: { icon?: string; color?: string }) => Promise<string | null>;
  updateBandLogo: (bandId: string, file: File | null) => Promise<string | null>;
  deleteBandSongList: (bandId: string, songListId: string) => Promise<string | null>;
  addSongToBandSongList: (bandId: string, songListId: string, songId: string) => Promise<string | null>;
  removeSongFromBandSongList: (bandId: string, songListId: string, songId: string) => Promise<string | null>;
  moveSongInBandSongList: (bandId: string, songListId: string, songId: string, beforeSongId: string | null) => Promise<string | null>;
  addBandSetlist: (bandId: string, name: string) => Promise<{ setlistId: string | null; error: string | null }>;
  renameBandSetlist: (bandId: string, setlistId: string, name: string) => Promise<string | null>;
  updateBandSetlistIcon: (bandId: string, setlistId: string, icon?: string) => Promise<string | null>;
  setBandSetlistPublicShare: (bandId: string, setlistId: string, enabled: boolean) => Promise<string | null>;
  deleteBandSetlist: (bandId: string, setlistId: string) => Promise<string | null>;
  addSongToBandSetlist: (bandId: string, setlistId: string, songId: string) => Promise<string | null>;
  removeSongFromBandSetlist: (bandId: string, setlistId: string, songId: string) => Promise<string | null>;
  moveSongInBandSetlist: (bandId: string, setlistId: string, songId: string, beforeSongId: string | null) => Promise<string | null>;
  updateSongNoteInBandSetlist: (bandId: string, setlistId: string, songId: string, note: string) => Promise<string | null>;
  addBandPressKit: (bandId: string, name: string) => Promise<{ kitId: string | null; error: string | null }>;
  deleteBandPressKit: (bandId: string, kitId: string) => Promise<string | null>;
  renameBandPressKit: (bandId: string, kitId: string, name: string) => Promise<string | null>;
  updateBandPressKitIcon: (bandId: string, kitId: string, icon?: string) => Promise<string | null>;
  addBandInputList: (bandId: string, name: string) => Promise<{ riderId: string | null; error: string | null }>;
  renameBandInputList: (bandId: string, riderId: string, name: string) => Promise<string | null>;
  updateBandInputListIcon: (bandId: string, riderId: string, icon?: string) => Promise<string | null>;
  setBandInputListPublicShare: (bandId: string, riderId: string, enabled: boolean) => Promise<string | null>;
  updateBandInputListContent: (params: {
    bandId: string;
    riderId: string;
    hospitalityNotes: string;
    logisticsNotes: string;
  }) => Promise<string | null>;
  updateBandInputListStageplotContent: (params: {
    bandId: string;
    riderId: string;
    items: StageplotItem[];
    drawingLayers: SongHandNoteDocument[];
  }) => Promise<string | null>;
  deleteBandInputList: (bandId: string, riderId: string) => Promise<string | null>;
  restoreBandTrashItem: (bandId: string, trashId: string) => Promise<string | null>;
  deleteBandTrashItemPermanently: (bandId: string, trashId: string) => Promise<string | null>;
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
  const [bandInputListsByBandId, setBandInputListsByBandId] = useState<Record<string, InputList[]>>({});
  const [bandPressKitsByBandId, setBandPressKitsByBandId] = useState<Record<string, PressKit[]>>({});
  const [bandTrashByBandId, setBandTrashByBandId] = useState<Record<string, BandTrashItem[]>>({});
  const [loading, setLoading] = useState(firebaseEnabled);
  const [membershipRepairUserId, setMembershipRepairUserId] = useState<string | null>(null);
  const [serverRepairUserId, setServerRepairUserId] = useState<string | null>(null);

  // Server-side recovery: re-associate this user to likely matching bands by ownerId/username/email.
  // Firestore-data-migration tool with no self-host equivalent (Postgres's band_members join
  // table doesn't have the denormalized-field-drift problem this repairs) — skip entirely there.
  useEffect(() => {
    if (isSelfHost || !userId || serverRepairUserId === userId) return;
    if (hasMigrationMarker(SERVER_REPAIR_MARKER, userId)) {
      setServerRepairUserId(userId);
      return;
    }

    setServerRepairUserId(userId);
    void repairBandMembershipOnServer({
      userId,
      userEmail,
      claimOwnership: true,
    }).then((result) => {
      setMigrationMarker(SERVER_REPAIR_MARKER, userId);
      if (result.repairedCount > 0) {
        console.info(`[Gigboy] Server repair linked ${result.repairedCount} band(s).`);
      }
      if (result.claimedCount > 0) {
        console.info(`[Gigboy] Server repair set owner on ${result.claimedCount} band(s).`);
      }
    }).catch((error) => {
      console.error('[Gigboy] Server-side band repair failed:', error);
    });
  }, [serverRepairUserId, userId, userEmail, userUsername]);

  // Repair owned bands if membership linkage was lost (e.g. memberIds missing current user).
  useEffect(() => {
    if (!db || !userId || membershipRepairUserId === userId) return;
    if (hasMigrationMarker(CLIENT_REPAIR_MARKER, userId)) {
      setMembershipRepairUserId(userId);
      return;
    }
    const firestore = db;

    setMembershipRepairUserId(userId);

    const repairOwnedBandsMembership = async () => {
      const ownedBandsSnapshot = await getDocs(
        query(collection(firestore, BANDS_COLLECTION), where('ownerId', '==', userId))
      );

      if (ownedBandsSnapshot.size === 0) return;

      let repairedCount = 0;

      await Promise.all(
        ownedBandsSnapshot.docs.map(async (bandDoc) => {
          const bandData = bandDoc.data() as Record<string, unknown>;
          const memberIds = Array.isArray(bandData.memberIds)
            ? bandData.memberIds.filter((entry): entry is string => typeof entry === 'string')
            : [];

          const memberRoles = typeof bandData.memberRoles === 'object' && bandData.memberRoles !== null
            ? { ...(bandData.memberRoles as Record<string, unknown>) }
            : {};
          const memberEmails = typeof bandData.memberEmails === 'object' && bandData.memberEmails !== null
            ? { ...(bandData.memberEmails as Record<string, unknown>) }
            : {};
          const memberUsernames = typeof bandData.memberUsernames === 'object' && bandData.memberUsernames !== null
            ? { ...(bandData.memberUsernames as Record<string, unknown>) }
            : {};
          const memberFullNames = typeof bandData.memberFullNames === 'object' && bandData.memberFullNames !== null
            ? { ...(bandData.memberFullNames as Record<string, unknown>) }
            : {};
          const memberAvatars = typeof bandData.memberAvatars === 'object' && bandData.memberAvatars !== null
            ? { ...(bandData.memberAvatars as Record<string, unknown>) }
            : {};

          const nextMemberIds = memberIds.includes(userId) ? memberIds : [...memberIds, userId];
          const nextMemberRoles = memberRoles[userId] === 'editor' || memberRoles[userId] === 'viewer'
            ? memberRoles
            : { ...memberRoles, [userId]: 'editor' };
          const nextMemberEmails = userEmail && memberEmails[userId] !== userEmail
            ? { ...memberEmails, [userId]: userEmail }
            : memberEmails;
          const nextMemberUsernames = userUsername && memberUsernames[userId] !== userUsername
            ? { ...memberUsernames, [userId]: userUsername }
            : memberUsernames;
          const nextMemberFullNames = userFullName && memberFullNames[userId] !== userFullName
            ? { ...memberFullNames, [userId]: userFullName }
            : memberFullNames;
          const nextMemberAvatars = userAvatar && memberAvatars[userId] !== userAvatar
            ? { ...memberAvatars, [userId]: userAvatar }
            : memberAvatars;

          const needsRepair = (
            nextMemberIds.length !== memberIds.length
            || nextMemberRoles !== memberRoles
            || nextMemberEmails !== memberEmails
            || nextMemberUsernames !== memberUsernames
            || nextMemberFullNames !== memberFullNames
            || nextMemberAvatars !== memberAvatars
          );

          if (!needsRepair) return;

          repairedCount += 1;
          await setDoc(doc(firestore, BANDS_COLLECTION, bandDoc.id), {
            memberIds: nextMemberIds,
            memberRoles: nextMemberRoles,
            memberEmails: nextMemberEmails,
            memberUsernames: nextMemberUsernames,
            memberFullNames: nextMemberFullNames,
            memberAvatars: nextMemberAvatars,
            updatedAt: new Date().toISOString(),
          }, { merge: true });
        })
      );

      if (repairedCount > 0) {
        console.info(`[Gigboy] Repaired membership for ${repairedCount} owned band(s).`);
      }

      setMigrationMarker(CLIENT_REPAIR_MARKER, userId);
    };

    void repairOwnedBandsMembership().catch((error) => {
      console.error('[Gigboy] Owned band membership repair failed:', error);
    });
  }, [membershipRepairUserId, userId, userEmail, userUsername, userFullName, userAvatar]);

  const refreshBands = useCallback(async () => {
    if (!userId) {
      setBands([]);
      return;
    }
    const nextBands = await dataClient.bands.list();
    setBands(nextBands);
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setBands([]);
      setBandSongsByBandId({});
      setBandSongListsByBandId({});
      setBandSetlistsByBandId({});
      setBandInputListsByBandId({});
      setBandPressKitsByBandId({});
      setBandTrashByBandId({});
      setLoading(false);
      return;
    }

    if (!db) {
      // Self-host has no realtime subscriptions: fetch once via the API-backed dataClient.
      setLoading(true);
      void dataClient.bands.list().then((nextBands) => {
        setBands(nextBands);
        setLoading(false);
      }).catch((error) => {
        console.error('Failed to load bands.', error);
        setLoading(false);
      });
      return;
    }

    setLoading(true);

    const bandsQuery = query(collection(db, BANDS_COLLECTION), where('memberIds', 'array-contains', userId));
    const ownedBandsQuery = query(collection(db, BANDS_COLLECTION), where('ownerId', '==', userId));

    let memberBands: Band[] = [];
    let ownerBands: Band[] = [];

    const updateMergedBands = () => {
      const mergedBands = mergeBandsById(memberBands, ownerBands);
      if (import.meta.env.DEV) {
        console.info(
          `[Gigboy] Band sources: member=${memberBands.length}, owner=${ownerBands.length}, merged=${mergedBands.length}`
        );
      }
      setBands(mergedBands);
      setLoading(false);
    };

    const unsubscribeMember = onSnapshot(
      bandsQuery,
      (snapshot) => {
        memberBands = snapshot.docs
          .map((entry) => normalizeBand(entry.id, entry.data() as Record<string, unknown>))
          .sort(compareBands);
        updateMergedBands();
      },
      (error) => {
        console.error('Failed to subscribe to member bands from Firestore.', error);
        setLoading(false);
      }
    );

    const unsubscribeOwner = onSnapshot(
      ownedBandsQuery,
      (snapshot) => {
        ownerBands = snapshot.docs
          .map((entry) => normalizeBand(entry.id, entry.data() as Record<string, unknown>))
          .sort(compareBands);
        updateMergedBands();
      },
      (error) => {
        console.error('Failed to subscribe to owned bands from Firestore.', error);
        setLoading(false);
      }
    );

    return () => {
      unsubscribeMember();
      unsubscribeOwner();
    };
  }, [refreshBands, userId]);

  const refreshBandSongs = useCallback(async (bandId: string) => {
    if (!userId) return;

    const songs = sortBandSongs(await dataClient.bandSongs.list(bandId));

    setBandSongsByBandId((prev) => ({
      ...prev,
      [bandId]: songs,
    }));
  }, [userId]);

  const refreshBandSongLists = useCallback(async (bandId: string) => {
    if (!userId) return;

    const songLists = sortBandSongLists(await dataClient.bandSongLists.list(bandId));

    setBandSongListsByBandId((prev) => ({
      ...prev,
      [bandId]: songLists,
    }));
  }, [userId]);

  const refreshBandSetlists = useCallback(async (bandId: string) => {
    if (!userId) return;

    const setlists = sortBandSetlists(await dataClient.bandSetlists.list(bandId));

    setBandSetlistsByBandId((prev) => ({
      ...prev,
      [bandId]: setlists,
    }));
  }, [userId]);

  const refreshBandInputLists = useCallback(async (bandId: string) => {
    if (!userId) return;

    const riders = sortInputLists(await dataClient.bandRiders.list(bandId));

    setBandInputListsByBandId((prev) => ({
      ...prev,
      [bandId]: riders,
    }));
  }, [userId]);

  const refreshBandPressKits = useCallback(async (bandId: string) => {
    if (!userId) return;

    const kits = await dataClient.bandPressKits.list(bandId);

    setBandPressKitsByBandId((prev) => ({ ...prev, [bandId]: kits }));
  }, [userId]);

  const addBandPressKit = useCallback(async (bandId: string, name: string): Promise<{ kitId: string | null; error: string | null }> => {
    if (!userId || !user?.email) return { kitId: null, error: 'Not signed in.' };

    const band = bands.find((entry) => entry.id === bandId);
    if (!band) return { kitId: null, error: 'Band not found.' };

    if (!bandCanUse(band, 'pressKits', user?.plan, user?.subscriptionStatus, user?.planOverride)) {
      return { kitId: null, error: 'Press kits require a Pro or Crew plan for this band.' };
    }

    const currentPressKits = bandPressKitsByBandId[bandId] ?? [];
    const pressKitLimit = resolveResourceLimit(band, 'pressKitLimit', user?.plan, user?.subscriptionStatus, user?.planOverride);
    if (pressKitLimit !== null && currentPressKits.length >= pressKitLimit) {
      return { kitId: null, error: `This band has reached the ${pressKitLimit}-press-kit limit for the Free plan. Upgrade to Pro or Crew for unlimited press kits.` };
    }

    const trimmed = name.trim();
    if (!trimmed) return { kitId: null, error: 'Press kit name is required.' };

    try {
      const newKit = await dataClient.bandPressKits.create(bandId, {
        id: '',
        name: trimmed,
        richText: '',
        imageIds: [],
        createdAt: new Date().toISOString(),
      });

      setBandPressKitsByBandId((prev) => ({
        ...prev,
        [bandId]: [...(prev[bandId] ?? []), newKit],
      }));

      return { kitId: newKit.id, error: null };
    } catch (error) {
      return { kitId: null, error: error instanceof Error ? error.message : 'Failed to create press kit.' };
    }
  }, [bands, bandPressKitsByBandId, userId, user?.email, user?.plan, user?.subscriptionStatus, user?.planOverride]);

  const deleteBandPressKit = useCallback(async (bandId: string, kitId: string): Promise<string | null> => {
    if (!userId) return 'Not signed in.';

    const band = bands.find((entry) => entry.id === bandId);
    if (!band) return 'Band not found.';

    const isEditor = band.ownerId === userId || band.memberRoles[userId] === 'editor';
    if (!isEditor) return 'You do not have permission to edit this band.';

    const previousKits = bandPressKitsByBandId[bandId] ?? [];
    const kitToDelete = previousKits.find((entry) => entry.id === kitId);
    if (!kitToDelete) return null;

    const { deletedAt, purgeAt } = createTrashTimestamps();
    const trashId = crypto.randomUUID();

    const nextKits = previousKits.filter((k) => k.id !== kitId);
    setBandPressKitsByBandId((prev) => ({
      ...prev,
      [bandId]: nextKits,
    }));
    setBandTrashByBandId((prev) => ({
      ...prev,
      [bandId]: [
        {
          bandId,
          trashId,
          itemType: 'pressKit' as const,
          deletedAt,
          purgeAt,
          pressKit: kitToDelete,
        },
        ...(prev[bandId] ?? []),
      ].sort(compareTrashByDeletedAtDesc),
    }));

    try {
      // Band trash writes are Firestore-only (self-host's `bandPressKits.remove` below
      // handles trashing server-side as part of Phase 5's soft-delete contract).
      if (db) {
        await setDoc(
          doc(db, BANDS_COLLECTION, bandId, TRASH_COLLECTION, trashId),
          createTrashPayload('pressKit', deletedAt, purgeAt, kitToDelete)
        );
      }
      await dataClient.bandPressKits.remove(bandId, kitId);
      return null;
    } catch (error) {
      setBandPressKitsByBandId((prev) => ({
        ...prev,
        [bandId]: previousKits,
      }));
      setBandTrashByBandId((prev) => ({
        ...prev,
        [bandId]: (prev[bandId] ?? []).filter((entry) => entry.trashId !== trashId),
      }));
      return error instanceof Error ? error.message : 'Failed to move press kit to trash.';
    }
  }, [bandPressKitsByBandId, bands, userId]);

  const renameBandPressKit = useCallback(async (bandId: string, kitId: string, name: string): Promise<string | null> => {
    if (!userId) return 'Band press kits require cloud sync.';
    const band = bands.find((entry) => entry.id === bandId);
    if (!band) return 'Band not found.';
    if (!band.memberIds.includes(userId)) return 'You do not have permission to edit this band.';
    const trimmed = name.trim();
    if (!trimmed) return 'Press kit name is required.';
    const previousKits = bandPressKitsByBandId[bandId] ?? [];
    const target = previousKits.find((kit) => kit.id === kitId);
    if (!target) return 'Press kit not found.';
    const nextKit: PressKit = { ...target, name: trimmed };
    setBandPressKitsByBandId((prev) => ({
      ...prev,
      [bandId]: (prev[bandId] ?? []).map((k) => k.id === kitId ? nextKit : k),
    }));
    try {
      await dataClient.bandPressKits.update(bandId, nextKit);
      return null;
    } catch (error) {
      setBandPressKitsByBandId((prev) => ({ ...prev, [bandId]: previousKits }));
      return error instanceof Error ? error.message : 'Failed to rename press kit.';
    }
  }, [bandPressKitsByBandId, bands, userId]);

  const updateBandPressKitIcon = useCallback(async (bandId: string, kitId: string, icon?: string): Promise<string | null> => {
    if (!userId) return 'Band press kits require cloud sync.';
    const band = bands.find((entry) => entry.id === bandId);
    if (!band) return 'Band not found.';
    if (!band.memberIds.includes(userId)) return 'You do not have permission to edit this band.';
    const previousKits = bandPressKitsByBandId[bandId] ?? [];
    const target = previousKits.find((kit) => kit.id === kitId);
    if (!target) return 'Press kit not found.';
    const nextKit: PressKit = { ...target, icon };
    setBandPressKitsByBandId((prev) => ({
      ...prev,
      [bandId]: (prev[bandId] ?? []).map((k) => k.id === kitId ? nextKit : k),
    }));
    try {
      await dataClient.bandPressKits.update(bandId, nextKit);
      return null;
    } catch (error) {
      setBandPressKitsByBandId((prev) => ({ ...prev, [bandId]: previousKits }));
      return error instanceof Error ? error.message : 'Failed to update press kit icon.';
    }
  }, [bandPressKitsByBandId, bands, userId]);

  const refreshBandTrash = useCallback(async (bandId: string) => {
    if (!db || !userId) return;

    const firestore = db;

    const snapshot = await getDocs(collection(firestore, BANDS_COLLECTION, bandId, TRASH_COLLECTION));
    const now = Date.now();

    const parsedSongs = snapshot.docs
      .map((entry) => parseSongTrashRecord(entry.id, entry.data() as Record<string, unknown>))
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
    const parsedSongLists = snapshot.docs
      .map((entry) => parseSongListTrashRecord(entry.id, entry.data() as Record<string, unknown>))
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
    const parsedSetlists = snapshot.docs
      .map((entry) => parseSetlistTrashRecord(entry.id, entry.data() as Record<string, unknown>))
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
    const parsedInputLists = snapshot.docs
      .map((entry) => parseInputListTrashRecord(entry.id, entry.data() as Record<string, unknown>))
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
    const parsedPressKits = snapshot.docs
      .map((entry) => parsePressKitTrashRecord(entry.id, entry.data() as Record<string, unknown>))
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
    const parsedPressKitImages = snapshot.docs
      .map((entry) => parsePressKitImageTrashRecord(entry.id, entry.data() as Record<string, unknown>))
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
    const parsedBandLogos = snapshot.docs
      .map((entry) => parseBandLogoTrashRecord(entry.id, entry.data() as Record<string, unknown>))
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
    const parsedAttachments = snapshot.docs
      .map((entry) => parseAttachmentTrashRecord(entry.id, entry.data() as Record<string, unknown>))
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

    const items: BandTrashItem[] = [
      ...parsedSongs.map((entry) => ({
        bandId,
        trashId: entry.id,
        itemType: 'song' as const,
        deletedAt: entry.deletedAt,
        purgeAt: entry.purgeAt,
        song: entry.data,
      })),
      ...parsedSongLists.map((entry) => ({
        bandId,
        trashId: entry.id,
        itemType: 'songlist' as const,
        deletedAt: entry.deletedAt,
        purgeAt: entry.purgeAt,
        songList: entry.data,
      })),
      ...parsedSetlists.map((entry) => ({
        bandId,
        trashId: entry.id,
        itemType: 'setlist' as const,
        deletedAt: entry.deletedAt,
        purgeAt: entry.purgeAt,
        setlist: entry.data,
      })),
      ...parsedInputLists.map((entry) => ({
        bandId,
        trashId: entry.id,
        itemType: 'technicalRider' as const,
        deletedAt: entry.deletedAt,
        purgeAt: entry.purgeAt,
        inputList: entry.data,
      })),
      ...parsedPressKits.map((entry) => ({
        bandId,
        trashId: entry.id,
        itemType: 'pressKit' as const,
        deletedAt: entry.deletedAt,
        purgeAt: entry.purgeAt,
        pressKit: entry.data,
      })),
      ...parsedPressKitImages.map((entry) => ({
        bandId,
        trashId: entry.id,
        itemType: 'pressKitImage' as const,
        deletedAt: entry.deletedAt,
        purgeAt: entry.purgeAt,
        image: entry.data.image,
        linkedPressKitIds: entry.data.linkedPressKitIds,
      })),
      ...parsedBandLogos.map((entry) => ({
        bandId,
        trashId: entry.id,
        itemType: 'bandLogo' as const,
        deletedAt: entry.deletedAt,
        purgeAt: entry.purgeAt,
        image: entry.data.image,
        linkedPressKitIds: entry.data.linkedPressKitIds,
      })),
      ...parsedAttachments.map((entry) => ({
        bandId,
        trashId: entry.id,
        itemType: 'attachment' as const,
        deletedAt: entry.deletedAt,
        purgeAt: entry.purgeAt,
        songId: entry.data.songId,
        songTitle: entry.data.songTitle,
        attachment: entry.data.attachment,
      })),
    ];

    const expiredItems = items.filter((entry) => isTrashExpired(entry.purgeAt, now));
    const activeItems = items.filter((entry) => !isTrashExpired(entry.purgeAt, now));

    if (expiredItems.length > 0) {
      void Promise.all(
        expiredItems.map((entry) => {
          const storageDelete = entry.itemType === 'attachment' && entry.attachment.storagePath && storage
            ? deleteObject(ref(storage, entry.attachment.storagePath)).catch(() => undefined)
            : Promise.resolve();
          return Promise.all([
            storageDelete,
            deleteDoc(doc(firestore, BANDS_COLLECTION, bandId, TRASH_COLLECTION, entry.trashId)),
          ]);
        })
      ).catch((error) => {
        console.warn('Failed to purge expired band trash items.', error);
      });
    }

    setBandTrashByBandId((prev) => ({
      ...prev,
      [bandId]: activeItems.sort(compareTrashByDeletedAtDesc),
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

    // First band is free; additional bands require payment via checkout. Self-host has
    // no plans/billing, so no band-count limit applies there.
    if (!isSelfHost) {
      const ownedBandCount = bands.filter((b) => b.ownerId === userId).length;
      if (ownedBandCount >= 1) {
        return {
          bandId: null,
          error: 'Additional bands require a paid Pro or Crew subscription for each.',
        };
      }
    }

    try {
      const band = await dataClient.bands.create({ name: trimmedName, description, icon });
      await refreshBands();
      return { bandId: band.id, error: null };
    } catch (error) {
      return {
        bandId: null,
        error: error instanceof Error ? error.message : 'Failed to create band.',
      };
    }
  }, [bands, refreshBands, userId]);

  const deleteBand = useCallback(async (bandId: string) => {
    if (!userId) {
      return 'Bands require a signed-in account.';
    }

    const band = bands.find((entry) => entry.id === bandId);
    if (!band) {
      return 'Band not found.';
    }

    try {
      await dataClient.bands.remove(bandId);
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
      setBandTrashByBandId((prev) => {
        const next = { ...prev };
        delete next[bandId];
        return next;
      });
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : 'Failed to delete band.';
    }
  }, [bands, userId]);

  const renameBand = useCallback(async (bandId: string, name: string) => {
    if (!userId) {
      return 'Bands require a signed-in account.';
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      return 'Band name is required.';
    }

    const band = bands.find((entry) => entry.id === bandId);
    if (!band) {
      return 'Band not found.';
    }

    if (!canEditBandLibrary(band, userId)) {
      return 'You do not have permission to edit this band.';
    }

    const previousBands = bands;
    const now = new Date().toISOString();
    const nextBands = bands
      .map((entry) => (entry.id === bandId ? { ...entry, name: trimmedName, updatedAt: now } : entry))
      .sort(compareBands);

    setBands(nextBands);

    try {
      await dataClient.bands.update(bandId, { name: trimmedName });
      return null;
    } catch (error) {
      setBands(previousBands);
      return error instanceof Error ? error.message : 'Failed to rename band.';
    }
  }, [bands, userId]);

  const updateBandDescription = useCallback(async (bandId: string, description: string) => {
    if (!userId) {
      return 'Bands require a signed-in account.';
    }

    const band = bands.find((entry) => entry.id === bandId);
    if (!band) {
      return 'Band not found.';
    }

    if (!canEditBandLibrary(band, userId)) {
      return 'You do not have permission to edit this band.';
    }

    const trimmed = description.trim();
    if (trimmed.length > 240) {
      return 'Band description must be 240 characters or fewer.';
    }

    const previousBands = bands;
    const now = new Date().toISOString();
    const nextDescription = trimmed || undefined;
    const nextBands = bands.map((entry) =>
      entry.id === bandId ? { ...entry, description: nextDescription, updatedAt: now } : entry
    );

    setBands(nextBands);

    try {
      await dataClient.bands.update(bandId, { description: trimmed });
      return null;
    } catch (error) {
      setBands(previousBands);
      return error instanceof Error ? error.message : 'Failed to update band description.';
    }
  }, [bands, userId]);

  const updateBandLibraryAppearance = useCallback(async (
    bandId: string,
    appearance: { icon?: string; color?: string }
  ) => {
    if (!db || !userId) {
      return 'Bands require cloud sync.';
    }

    const band = bands.find((entry) => entry.id === bandId);
    if (!band) {
      return 'Band not found.';
    }

    if (!canEditBandLibrary(band, userId)) {
      return 'You do not have permission to edit this band.';
    }

    const previousBands = bands;
    const now = new Date().toISOString();
    const { icon, color } = appearance;
    const nextBands = bands
      .map((entry) => (entry.id === bandId ? { ...entry, icon, color, updatedAt: now } : entry))
      .sort(compareBands);

    setBands(nextBands);

    try {
      await setDoc(doc(db, BANDS_COLLECTION, bandId), {
        icon: icon ?? deleteField(),
        color: color ?? deleteField(),
        updatedAt: now,
      }, { merge: true });
      return null;
    } catch (error) {
      setBands(previousBands);
      return error instanceof Error ? error.message : 'Failed to update band appearance.';
    }
  }, [bands, userId]);

  const updateBandLogo = useCallback(async (bandId: string, file: File | null) => {
    if (!db || !storage || !userId) {
      return 'Bands require cloud sync.';
    }

    const band = bands.find((entry) => entry.id === bandId);
    if (!band) {
      return 'Band not found.';
    }

    if (!canEditBandLibrary(band, userId)) {
      return 'You do not have permission to edit this band.';
    }

    const previousBands = bands;
    const now = new Date().toISOString();
    const logoImageId = 'band-logo';
    const logoThumbStoragePath = `bands/${bandId}/logo-thumb.webp`;

    if (!file) {
      const previousPressKits = bandPressKitsByBandId[bandId] ?? [];
      const linkedPressKitIds = previousPressKits
        .filter((kit) => Array.isArray(kit.imageIds) && kit.imageIds.includes(logoImageId))
        .map((kit) => kit.id);
      const nextPressKits = previousPressKits.map((kit) => ({
        ...kit,
        imageIds: kit.imageIds.filter((entryId) => entryId !== logoImageId),
      }));

      const { deletedAt, purgeAt } = createTrashTimestamps();
      const trashId = crypto.randomUUID();

      const nextBands = bands
        .map((entry) => (entry.id === bandId ? { ...entry, logo: undefined, logoStoragePath: undefined, updatedAt: now } : entry))
        .sort(compareBands);

      const firestore = db;

      setBands(nextBands);
      setBandPressKitsByBandId((prev) => ({
        ...prev,
        [bandId]: nextPressKits,
      }));
      setBandTrashByBandId((prev) => ({
        ...prev,
        [bandId]: [
          {
            bandId,
            trashId,
            itemType: 'bandLogo' as const,
            deletedAt,
            purgeAt,
            image: {
              id: 'band-logo' as const,
              title: 'Band Logo',
              url: band.logo ?? '',
              storagePath: band.logoStoragePath,
              thumbStoragePath: logoThumbStoragePath,
            },
            linkedPressKitIds,
          },
          ...(prev[bandId] ?? []),
        ].sort(compareTrashByDeletedAtDesc),
      }));

      try {
        const logoImageSnapshot = await getDoc(doc(db, 'bands', bandId, 'pressKitImages', logoImageId));
        const logoImageData = logoImageSnapshot.exists()
          ? (logoImageSnapshot.data() as Record<string, unknown>)
          : null;

        const logoPayload = {
          id: 'band-logo' as const,
          title: typeof logoImageData?.title === 'string' ? logoImageData.title : 'Band Logo',
          url: typeof logoImageData?.url === 'string' ? logoImageData.url : (band.logo ?? ''),
          thumbUrl: typeof logoImageData?.thumbUrl === 'string' ? logoImageData.thumbUrl : undefined,
          storagePath: typeof logoImageData?.storagePath === 'string' ? logoImageData.storagePath : band.logoStoragePath,
          thumbStoragePath: typeof logoImageData?.thumbStoragePath === 'string' ? logoImageData.thumbStoragePath : logoThumbStoragePath,
          mimeType: typeof logoImageData?.mimeType === 'string' ? logoImageData.mimeType : undefined,
          sizeBytes: typeof logoImageData?.sizeBytes === 'number' ? logoImageData.sizeBytes : undefined,
          thumbSizeBytes: typeof logoImageData?.thumbSizeBytes === 'number' ? logoImageData.thumbSizeBytes : undefined,
          createdAt: typeof logoImageData?.createdAt === 'string' ? logoImageData.createdAt : undefined,
          createdBy: typeof logoImageData?.createdBy === 'string' ? logoImageData.createdBy : undefined,
        };

        await Promise.all([
          setDoc(doc(firestore, BANDS_COLLECTION, bandId, TRASH_COLLECTION, trashId), createTrashPayload('bandLogo', deletedAt, purgeAt, {
            image: logoPayload,
            linkedPressKitIds,
          })),
          setDoc(doc(firestore, BANDS_COLLECTION, bandId), {
            logo: deleteField(),
            logoStoragePath: deleteField(),
            updatedAt: now,
          }, { merge: true }),
          deleteDoc(doc(firestore, 'bands', bandId, 'pressKitImages', logoImageId)).catch(() => undefined),
          ...nextPressKits.map((kit) => setDoc(
            doc(firestore, BANDS_COLLECTION, bandId, BAND_PRESS_KITS_COLLECTION, kit.id),
            { imageIds: kit.imageIds, updatedAt: now },
            { merge: true }
          )),
        ]);

        return null;
      } catch (error) {
        setBands(previousBands);
        setBandPressKitsByBandId((prev) => ({
          ...prev,
          [bandId]: previousPressKits,
        }));
        setBandTrashByBandId((prev) => ({
          ...prev,
          [bandId]: (prev[bandId] ?? []).filter((entry) => entry.trashId !== trashId),
        }));
        return error instanceof Error ? error.message : 'Failed to remove band logo.';
      }
    }

    // Upload new logo
    try {
      const ext = file.name.includes('.') ? file.name.split('.').pop()?.toLowerCase() ?? 'bin' : 'bin';
      const logoStoragePath = `bands/${bandId}/logo.${ext}`;
      const storageRef = ref(storage, logoStoragePath);

      await uploadBytes(storageRef, file, {
        contentType: file.type || undefined,
        cacheControl: 'public,max-age=300',
      });
      const logoUrl = await getDownloadURL(storageRef);

      const thumbBlob = await createWebpThumbnail(file);
      let logoThumbUrl: string | undefined;
      let logoThumbSizeBytes: number | undefined;

      if (thumbBlob) {
        const thumbRef = ref(storage, logoThumbStoragePath);
        await uploadBytes(thumbRef, thumbBlob, {
          contentType: 'image/webp',
          cacheControl: 'public,max-age=86400',
        });
        logoThumbUrl = await getDownloadURL(thumbRef);
        logoThumbSizeBytes = thumbBlob.size;
      }

      const nextBands = bands
        .map((entry) => (entry.id === bandId ? { ...entry, logo: logoUrl, logoStoragePath, updatedAt: now } : entry))
        .sort(compareBands);

      setBands(nextBands);

      await setDoc(doc(db, BANDS_COLLECTION, bandId), {
        logo: logoUrl,
        logoStoragePath,
        updatedAt: now,
      }, { merge: true });

      // Also add to press kit images so it's available there
      await setDoc(doc(db, 'bands', bandId, 'pressKitImages', logoImageId), {
        title: 'Band Logo',
        url: logoUrl,
        thumbUrl: logoThumbUrl ?? null,
        storagePath: logoStoragePath,
        thumbStoragePath: logoThumbUrl ? logoThumbStoragePath : null,
        mimeType: file.type || 'image/jpeg',
        sizeBytes: file.size,
        thumbSizeBytes: logoThumbSizeBytes ?? null,
        createdAt: now,
        createdBy: userId,
      });

      return null;
    } catch (error) {
      setBands(previousBands);
      return error instanceof Error ? error.message : 'Failed to upload band logo.';
    }
  }, [bandPressKitsByBandId, bands, userId]);

  const removeMember = useCallback(async (bandId: string, memberId: string) => {
    if (!userId) {
      return 'Bands require a signed-in account.';
    }

    try {
      await dataClient.bands.removeMember(bandId, memberId);
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
  }, [userId]);

  const leaveBand = useCallback(async (bandId: string) => {
    if (!userId) {
      return 'Bands require a signed-in account.';
    }
    return removeMember(bandId, userId);
  }, [removeMember, userId]);

  const addSongToBandLibrary = useCallback(async (bandId: string, song: Song) => {
    if (!userId) {
      return 'Band libraries require a signed-in account.';
    }

    const band = bands.find((entry) => entry.id === bandId);
    if (!band) {
      return 'Band not found.';
    }

    const isMember = band.memberIds.includes(userId);
    if (!isMember) {
      return 'You do not have permission to edit this band library.';
    }

    // Enforce band library song limit using the effective plan (higher of band or owner's
    // personal plan wins). Self-host has no plans/billing, so no song limit applies there.
    const currentBandSongs = bandSongsByBandId[bandId] ?? [];
    if (!isSelfHost) {
      const bandBillingPlan = band.billingPlan === 'pro' || band.billingPlan === 'crew' ? band.billingPlan : 'free';
      const bandPlanActive = bandBillingPlan === 'free'
        || band.billingSubscriptionStatus === 'active'
        || band.billingSubscriptionStatus === 'trialing'
        || band.billingSubscriptionStatus == null;
      const userPlan = user?.plan === 'pro' || user?.plan === 'crew' ? user.plan : 'free';
      const userPlanActive = user?.planOverride === true
        || userPlan === 'free'
        || user?.subscriptionStatus === 'active'
        || user?.subscriptionStatus === 'trialing';
      const planOrder: Record<string, number> = { free: 0, pro: 1, crew: 2 };
      const effectivePlan = (planOrder[bandBillingPlan] ?? 0) >= (planOrder[userPlan] ?? 0) && bandPlanActive
        ? bandBillingPlan
        : userPlan;
      const effectiveActive = effectivePlan === bandBillingPlan ? bandPlanActive : userPlanActive;
      const limit = effectiveActive ? PLAN_LIMITS[effectivePlan].songLimit : PLAN_LIMITS.free.songLimit;
      if (limit !== null && currentBandSongs.length >= limit) {
        return `This band has reached the ${limit}-song limit for the ${effectivePlan === 'free' ? 'Free' : effectivePlan === 'pro' ? 'Pro' : 'Crew'} plan. Upgrade to add more songs.`;
      }
    }

    const songId = song.id || crypto.randomUUID();
    const nextSortOrder = currentBandSongs.reduce((max, entry) => {
      if (typeof entry.sortOrder !== 'number') return max;
      return Math.max(max, entry.sortOrder);
    }, -1) + 1;
    const nextSong: Song = {
      ...song,
      id: songId,
      sortOrder: nextSortOrder,
      ownerId: band.ownerId,
      collaboratorIds: band.memberIds,
      collaborationPermissions: Object.fromEntries(
        band.memberIds.map((memberId) => [memberId, band.memberRoles[memberId] ?? 'viewer'])
      ),
      updatedAt: new Date().toISOString(),
    };

    try {
      await dataClient.bandSongs.create(bandId, nextSong);
      await refreshBandSongs(bandId);
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : 'Failed to add song to band library.';
    }
  }, [bandSongsByBandId, bands, refreshBandSongs, userId, user]);

  const updateBandSong = useCallback(async (bandId: string, song: Song) => {
    if (!userId) {
      return 'Band libraries require a signed-in account.';
    }

    const band = bands.find((entry) => entry.id === bandId);
    if (!band) {
      return 'Band not found.';
    }

    const isMember = band.memberIds.includes(userId);
    if (!isMember) {
      return 'You do not have permission to edit this band library.';
    }

    const previousSongs = bandSongsByBandId[bandId] ?? [];
    const existingSong = previousSongs.find((entry) => entry.id === song.id);
    if (!existingSong) {
      return 'Song not found in this band library.';
    }

    const nextSong: Song = {
      ...song,
      ownerId: existingSong.ownerId ?? band.ownerId,
      collaboratorIds: existingSong.collaboratorIds ?? band.memberIds,
      collaborationPermissions: existingSong.collaborationPermissions ?? Object.fromEntries(
        band.memberIds.map((memberId) => [memberId, band.memberRoles[memberId] ?? 'viewer'])
      ),
      accessRole: 'owner',
      sortOrder: song.sortOrder ?? existingSong.sortOrder,
      createdAt: existingSong.createdAt ?? song.createdAt,
      updatedAt: new Date().toISOString(),
    };

    const nextSongs = previousSongs.map((entry) => (entry.id === nextSong.id ? nextSong : entry));
    setBandSongsByBandId((prev) => ({
      ...prev,
      [bandId]: nextSongs,
    }));

    try {
      await dataClient.bandSongs.update(bandId, nextSong);
      return null;
    } catch (error) {
      setBandSongsByBandId((prev) => ({
        ...prev,
        [bandId]: previousSongs,
      }));
      return error instanceof Error ? error.message : 'Failed to update band song.';
    }
  }, [bandSongsByBandId, bands, userId]);

  const removeSongFromBandLibrary = useCallback(async (bandId: string, songId: string) => {
    if (!userId) {
      return 'Band libraries require a signed-in account.';
    }

    const band = bands.find((entry) => entry.id === bandId);
    if (!band) {
      return 'Band not found.';
    }

    const isMember = band.memberIds.includes(userId);
    if (!isMember) {
      return 'You do not have permission to edit this band library.';
    }

    const previousSongs = bandSongsByBandId[bandId] ?? [];
    const songToDelete = previousSongs.find((song) => song.id === songId);
    if (!songToDelete) {
      return null;
    }

    const { deletedAt, purgeAt } = createTrashTimestamps();
    const trashId = crypto.randomUUID();

    setBandSongsByBandId((prev) => ({
      ...prev,
      [bandId]: previousSongs.filter((song) => song.id !== songId),
    }));
    setBandTrashByBandId((prev) => ({
      ...prev,
      [bandId]: [
        {
          bandId,
          trashId,
          itemType: 'song' as const,
          deletedAt,
          purgeAt,
          song: songToDelete,
        },
        ...(prev[bandId] ?? []),
      ].sort(compareTrashByDeletedAtDesc),
    }));

    try {
      // Band trash is out of scope for the self-host backend; keep it Firestore-only.
      if (db) {
        await setDoc(
          doc(db, BANDS_COLLECTION, bandId, TRASH_COLLECTION, trashId),
          createTrashPayload('song', deletedAt, purgeAt, songToDelete)
        );
      }
      await dataClient.bandSongs.remove(bandId, songId);
      return null;
    } catch (error) {
      setBandSongsByBandId((prev) => ({
        ...prev,
        [bandId]: previousSongs,
      }));
      setBandTrashByBandId((prev) => ({
        ...prev,
        [bandId]: (prev[bandId] ?? []).filter((entry) => entry.trashId !== trashId),
      }));
      return error instanceof Error ? error.message : 'Failed to remove song from band library.';
    }
  }, [bandSongsByBandId, bands, userId]);

  const moveBandSong = useCallback(async (bandId: string, songId: string, beforeSongId: string | null) => {
    if (!userId) {
      return 'Band libraries require a signed-in account.';
    }

    const band = bands.find((entry) => entry.id === bandId);
    if (!band) {
      return 'Band not found.';
    }

    const isMember = band.memberIds.includes(userId);
    if (!isMember) {
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
      await Promise.all(nextSongs.map((song) => dataClient.bandSongs.update(bandId, song)));
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
    if (!userId) {
      return { songListId: null, error: 'Band songlists require a signed-in account.' };
    }

    const band = bands.find((entry) => entry.id === bandId);
    if (!band) {
      return { songListId: null, error: 'Band not found.' };
    }

    const isMember = band.memberIds.includes(userId);
    if (!isMember) {
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
      await dataClient.bandSongLists.create(bandId, nextSongList);
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
    if (!userId) {
      return 'Band songlists require a signed-in account.';
    }

    const band = bands.find((entry) => entry.id === bandId);
    if (!band) return 'Band not found.';

    const isMember = band.memberIds.includes(userId);
    if (!isMember) {
      return 'You do not have permission to edit this band.';
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      return 'Songlist name is required.';
    }

    const previousSongLists = bandSongListsByBandId[bandId] ?? [];
    const targetSongList = previousSongLists.find((songList) => songList.id === songListId);
    if (!targetSongList) return 'Songlist not found.';
    const nextSongList = { ...targetSongList, name: trimmedName };
    const nextSongLists = previousSongLists.map((songList) => (
      songList.id === songListId ? nextSongList : songList
    ));

    setBandSongListsByBandId((prev) => ({
      ...prev,
      [bandId]: nextSongLists,
    }));

    try {
      await dataClient.bandSongLists.update(bandId, nextSongList);
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
    if (!userId) {
      return 'Band songlists require a signed-in account.';
    }

    const band = bands.find((entry) => entry.id === bandId);
    if (!band) return 'Band not found.';

    const isMember = band.memberIds.includes(userId);
    if (!isMember) {
      return 'You do not have permission to edit this band.';
    }

    const previousSongLists = bandSongListsByBandId[bandId] ?? [];
    const targetSongList = previousSongLists.find((songList) => songList.id === songListId);
    if (!targetSongList) return 'Songlist not found.';
    const nextSongList = { ...targetSongList, icon };
    const nextSongLists = previousSongLists.map((songList) => (
      songList.id === songListId ? nextSongList : songList
    ));

    setBandSongListsByBandId((prev) => ({
      ...prev,
      [bandId]: nextSongLists,
    }));

    try {
      await dataClient.bandSongLists.update(bandId, nextSongList);
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
    if (!userId) {
      return 'Band songlists require a signed-in account.';
    }

    const band = bands.find((entry) => entry.id === bandId);
    if (!band) return 'Band not found.';

    const isEditor = band.ownerId === userId || band.memberRoles[userId] === 'editor';
    if (!isEditor) {
      return 'You do not have permission to edit this band.';
    }

    const previousSongLists = bandSongListsByBandId[bandId] ?? [];
    const songListToDelete = previousSongLists.find((songList) => songList.id === songListId);
    if (!songListToDelete) {
      return null;
    }

    const { deletedAt, purgeAt } = createTrashTimestamps();
    const trashId = crypto.randomUUID();
    const nextSongLists = withSequentialSongListSortOrder(
      previousSongLists.filter((songList) => songList.id !== songListId)
    );

    setBandSongListsByBandId((prev) => ({
      ...prev,
      [bandId]: nextSongLists,
    }));
    setBandTrashByBandId((prev) => ({
      ...prev,
      [bandId]: [
        {
          bandId,
          trashId,
          itemType: 'songlist' as const,
          deletedAt,
          purgeAt,
          songList: songListToDelete,
        },
        ...(prev[bandId] ?? []),
      ].sort(compareTrashByDeletedAtDesc),
    }));

    try {
      // Band trash is out of scope for the self-host backend; keep it Firestore-only.
      if (db) {
        await setDoc(
          doc(db, BANDS_COLLECTION, bandId, TRASH_COLLECTION, trashId),
          createTrashPayload('songlist', deletedAt, purgeAt, songListToDelete)
        );
      }
      await Promise.all([
        dataClient.bandSongLists.remove(bandId, songListId),
        ...nextSongLists.map((songList) => dataClient.bandSongLists.update(bandId, songList)),
      ]);
      return null;
    } catch (error) {
      setBandSongListsByBandId((prev) => ({
        ...prev,
        [bandId]: previousSongLists,
      }));
      setBandTrashByBandId((prev) => ({
        ...prev,
        [bandId]: (prev[bandId] ?? []).filter((entry) => entry.trashId !== trashId),
      }));
      return error instanceof Error ? error.message : 'Failed to delete band songlist.';
    }
  }, [bandSongListsByBandId, bands, userId]);

  const addSongToBandSongList = useCallback(async (bandId: string, songListId: string, songId: string) => {
    if (!userId) {
      return 'Band songlists require a signed-in account.';
    }

    const band = bands.find((entry) => entry.id === bandId);
    if (!band) return 'Band not found.';

    const isMember = band.memberIds.includes(userId);
    if (!isMember) return 'You do not have permission to edit this band.';

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
      await dataClient.bandSongLists.update(bandId, nextSongList);
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
    if (!userId) {
      return 'Band songlists require a signed-in account.';
    }

    const band = bands.find((entry) => entry.id === bandId);
    if (!band) return 'Band not found.';

    const isMember = band.memberIds.includes(userId);
    if (!isMember) return 'You do not have permission to edit this band.';

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
      await dataClient.bandSongLists.update(bandId, nextSongList);
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
    if (!userId) {
      return 'Band songlists require a signed-in account.';
    }

    const band = bands.find((entry) => entry.id === bandId);
    if (!band) return 'Band not found.';

    const isMember = band.memberIds.includes(userId);
    if (!isMember) return 'You do not have permission to edit this band.';

    const previousSongLists = bandSongListsByBandId[bandId] ?? [];
    const targetSongList = previousSongLists.find((songList) => songList.id === songListId);
    if (!targetSongList) return null;

    const nextSongIds = moveIdBefore(targetSongList.songIds, songId, beforeSongId);
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
      await dataClient.bandSongLists.update(bandId, nextSongList);
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
    if (!userId) {
      return { setlistId: null, error: 'Band setlists require a signed-in account.' };
    }

    const band = bands.find((entry) => entry.id === bandId);
    if (!band) {
      return { setlistId: null, error: 'Band not found.' };
    }

    const isMember = band.memberIds.includes(userId);
    if (!isMember) {
      return { setlistId: null, error: 'You do not have permission to edit this band.' };
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      return { setlistId: null, error: 'Setlist name is required.' };
    }

    if (!bandCanUse(band, 'setlists', user?.plan, user?.subscriptionStatus, user?.planOverride)) {
      return { setlistId: null, error: 'Setlists require a Pro or Crew plan for this band.' };
    }

    const now = new Date().toISOString();
    const currentSetlists = bandSetlistsByBandId[bandId] ?? [];

    const setlistLimit = resolveResourceLimit(band, 'setlistLimit', user?.plan, user?.subscriptionStatus, user?.planOverride);
    if (setlistLimit !== null && currentSetlists.length >= setlistLimit) {
      return { setlistId: null, error: `This band has reached the ${setlistLimit}-setlist limit for the Free plan. Upgrade to Pro or Crew for unlimited setlists.` };
    }

    const setlistId = crypto.randomUUID();
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
      await dataClient.bandSetlists.create(bandId, nextSetlist);
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
    if (!userId) {
      return 'Band setlists require a signed-in account.';
    }

    const band = bands.find((entry) => entry.id === bandId);
    if (!band) return 'Band not found.';

    const isMember = band.memberIds.includes(userId);
    if (!isMember) return 'You do not have permission to edit this band.';

    const trimmedName = name.trim();
    if (!trimmedName) return 'Setlist name is required.';

    const previousSetlists = bandSetlistsByBandId[bandId] ?? [];
    const targetSetlist = previousSetlists.find((setlist) => setlist.id === setlistId);
    if (!targetSetlist) return 'Setlist not found.';
    const now = new Date().toISOString();
    const nextSetlist = { ...targetSetlist, name: trimmedName, updatedAt: now };
    const nextSetlists = previousSetlists.map((setlist) => (
      setlist.id === setlistId ? nextSetlist : setlist
    ));

    setBandSetlistsByBandId((prev) => ({
      ...prev,
      [bandId]: nextSetlists,
    }));

    try {
      await dataClient.bandSetlists.update(bandId, nextSetlist);
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
    if (!userId) {
      return 'Band setlists require a signed-in account.';
    }

    const band = bands.find((entry) => entry.id === bandId);
    if (!band) return 'Band not found.';

    const isMember = band.memberIds.includes(userId);
    if (!isMember) return 'You do not have permission to edit this band.';

    const previousSetlists = bandSetlistsByBandId[bandId] ?? [];
    const targetSetlist = previousSetlists.find((setlist) => setlist.id === setlistId);
    if (!targetSetlist) return 'Setlist not found.';
    const now = new Date().toISOString();
    const nextSetlist = { ...targetSetlist, icon, updatedAt: now };
    const nextSetlists = previousSetlists.map((setlist) => (
      setlist.id === setlistId ? nextSetlist : setlist
    ));

    setBandSetlistsByBandId((prev) => ({
      ...prev,
      [bandId]: nextSetlists,
    }));

    try {
      await dataClient.bandSetlists.update(bandId, nextSetlist);
      return null;
    } catch (error) {
      setBandSetlistsByBandId((prev) => ({
        ...prev,
        [bandId]: previousSetlists,
      }));
      return error instanceof Error ? error.message : 'Failed to update band setlist icon.';
    }
  }, [bandSetlistsByBandId, bands, userId]);

  const setBandSetlistPublicShare = useCallback(async (bandId: string, setlistId: string, enabled: boolean) => {
    if (!db || !userId) {
      return 'Band setlists require cloud sync.';
    }

    const band = bands.find((entry) => entry.id === bandId);
    if (!band) return 'Band not found.';

    const isMember = band.memberIds.includes(userId);
    if (!isMember) return 'You do not have permission to edit this band.';

    const previousSetlists = bandSetlistsByBandId[bandId] ?? [];
    const targetSetlist = previousSetlists.find((setlist) => setlist.id === setlistId);
    if (!targetSetlist) return 'Setlist not found.';

    if (enabled && !bandCanUse(band, 'shareableLinks', user?.plan, user?.subscriptionStatus, user?.planOverride)) {
      return 'Shareable public links require a Pro or Crew plan for this band.';
    }

    const bandSongs = bandSongsByBandId[bandId] ?? [];
    const publicSongs = enabled ? buildPublicSongs(targetSetlist.songIds, bandSongs) : undefined;

    const now = new Date().toISOString();
    const nextSetlists = previousSetlists.map((setlist) => (
      setlist.id === setlistId
        ? {
            ...setlist,
            publicShareEnabled: enabled || undefined,
            publicSongs,
            publicSongNotes: enabled ? (targetSetlist.songNotes ?? {}) : undefined,
            bandName: enabled ? band.name : undefined,
            updatedAt: now,
          }
        : setlist
    ));

    setBandSetlistsByBandId((prev) => ({
      ...prev,
      [bandId]: nextSetlists,
    }));

    try {
      const updateData: Record<string, unknown> = {
        publicShareEnabled: enabled || null,
        publicSongs: publicSongs ?? null,
        publicSongNotes: enabled ? (targetSetlist.songNotes ?? {}) : null,
        bandName: enabled ? band.name : null,
        updatedAt: now,
      };
      await setDoc(doc(db, BANDS_COLLECTION, bandId, BAND_SETLISTS_COLLECTION, setlistId), updateData, { merge: true });
      return null;
    } catch (error) {
      setBandSetlistsByBandId((prev) => ({
        ...prev,
        [bandId]: previousSetlists,
      }));
      return error instanceof Error ? error.message : 'Failed to update setlist sharing.';
    }
  }, [bandSetlistsByBandId, bandSongsByBandId, bands, userId, user?.plan, user?.subscriptionStatus, user?.planOverride]);

  const deleteBandSetlist = useCallback(async (bandId: string, setlistId: string) => {
    if (!userId) {
      return 'Band setlists require a signed-in account.';
    }

    const band = bands.find((entry) => entry.id === bandId);
    if (!band) return 'Band not found.';

    const isEditor = band.ownerId === userId || band.memberRoles[userId] === 'editor';
    if (!isEditor) {
      return 'You do not have permission to edit this band.';
    }

    const previousSetlists = bandSetlistsByBandId[bandId] ?? [];
    const setlistToDelete = previousSetlists.find((setlist) => setlist.id === setlistId);
    if (!setlistToDelete) {
      return null;
    }

    const { deletedAt, purgeAt } = createTrashTimestamps();
    const trashId = crypto.randomUUID();
    const nextSetlists = withSequentialSetlistSortOrder(
      previousSetlists.filter((setlist) => setlist.id !== setlistId)
    );

    setBandSetlistsByBandId((prev) => ({
      ...prev,
      [bandId]: nextSetlists,
    }));
    setBandTrashByBandId((prev) => ({
      ...prev,
      [bandId]: [
        {
          bandId,
          trashId,
          itemType: 'setlist' as const,
          deletedAt,
          purgeAt,
          setlist: setlistToDelete,
        },
        ...(prev[bandId] ?? []),
      ].sort(compareTrashByDeletedAtDesc),
    }));

    try {
      // Band trash is out of scope for the self-host backend; keep it Firestore-only.
      if (db) {
        await setDoc(
          doc(db, BANDS_COLLECTION, bandId, TRASH_COLLECTION, trashId),
          createTrashPayload('setlist', deletedAt, purgeAt, setlistToDelete)
        );
      }
      await Promise.all([
        dataClient.bandSetlists.remove(bandId, setlistId),
        ...nextSetlists.map((setlist) => dataClient.bandSetlists.update(bandId, setlist)),
      ]);
      return null;
    } catch (error) {
      setBandSetlistsByBandId((prev) => ({
        ...prev,
        [bandId]: previousSetlists,
      }));
      setBandTrashByBandId((prev) => ({
        ...prev,
        [bandId]: (prev[bandId] ?? []).filter((entry) => entry.trashId !== trashId),
      }));
      return error instanceof Error ? error.message : 'Failed to delete band setlist.';
    }
  }, [bandSetlistsByBandId, bands, userId]);

  const addSongToBandSetlist = useCallback(async (bandId: string, setlistId: string, songId: string) => {
    if (!userId) {
      return 'Band setlists require a signed-in account.';
    }

    const band = bands.find((entry) => entry.id === bandId);
    if (!band) return 'Band not found.';

    const isMember = band.memberIds.includes(userId);
    if (!isMember) return 'You do not have permission to edit this band.';

    const now = new Date().toISOString();
    const bandSongs = bandSongsByBandId[bandId] ?? [];
    const previousSetlists = bandSetlistsByBandId[bandId] ?? [];
    const targetSetlist = previousSetlists.find((setlist) => setlist.id === setlistId);
    if (!targetSetlist || targetSetlist.songIds.includes(songId)) return null;

    const nextSongIds = [...targetSetlist.songIds, songId];
    const nextSetlist = {
      ...targetSetlist,
      songIds: nextSongIds,
      publicSongs: targetSetlist.publicShareEnabled ? buildPublicSongs(nextSongIds, bandSongs) : targetSetlist.publicSongs,
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
      await dataClient.bandSetlists.update(bandId, nextSetlist);
      return null;
    } catch (error) {
      setBandSetlistsByBandId((prev) => ({
        ...prev,
        [bandId]: previousSetlists,
      }));
      return error instanceof Error ? error.message : 'Failed to update band setlist.';
    }
  }, [bandSetlistsByBandId, bandSongsByBandId, bands, userId]);

  const removeSongFromBandSetlist = useCallback(async (bandId: string, setlistId: string, songId: string) => {
    if (!userId) {
      return 'Band setlists require a signed-in account.';
    }

    const band = bands.find((entry) => entry.id === bandId);
    if (!band) return 'Band not found.';

    const isMember = band.memberIds.includes(userId);
    if (!isMember) return 'You do not have permission to edit this band.';

    const previousSetlists = bandSetlistsByBandId[bandId] ?? [];
    const targetSetlist = previousSetlists.find((setlist) => setlist.id === setlistId);
    if (!targetSetlist) return null;

    const now = new Date().toISOString();
    const nextSongIds = targetSetlist.songIds.filter((entry) => entry !== songId);
    const nextSongNotes = { ...(targetSetlist.songNotes ?? {}) };
    delete nextSongNotes[songId];
    const bandSongs = bandSongsByBandId[bandId] ?? [];
    const nextSetlist = {
      ...targetSetlist,
      songIds: nextSongIds,
      songNotes: Object.keys(nextSongNotes).length > 0 ? nextSongNotes : undefined,
      publicSongs: targetSetlist.publicShareEnabled ? buildPublicSongs(nextSongIds, bandSongs) : targetSetlist.publicSongs,
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
      await dataClient.bandSetlists.update(bandId, nextSetlist);
      return null;
    } catch (error) {
      setBandSetlistsByBandId((prev) => ({
        ...prev,
        [bandId]: previousSetlists,
      }));
      return error instanceof Error ? error.message : 'Failed to update band setlist.';
    }
  }, [bandSetlistsByBandId, bandSongsByBandId, bands, userId]);

  const moveSongInBandSetlist = useCallback(async (bandId: string, setlistId: string, songId: string, beforeSongId: string | null) => {
    if (!userId) {
      return 'Band setlists require a signed-in account.';
    }

    const band = bands.find((entry) => entry.id === bandId);
    if (!band) return 'Band not found.';

    const isMember = band.memberIds.includes(userId);
    if (!isMember) return 'You do not have permission to edit this band.';

    const previousSetlists = bandSetlistsByBandId[bandId] ?? [];
    const targetSetlist = previousSetlists.find((setlist) => setlist.id === setlistId);
    if (!targetSetlist) return null;

    const nextSongIds = moveIdBefore(targetSetlist.songIds, songId, beforeSongId);
    if (nextSongIds === targetSetlist.songIds) {
      return null;
    }

    const now = new Date().toISOString();
    const bandSongs = bandSongsByBandId[bandId] ?? [];
    const nextSetlist = {
      ...targetSetlist,
      songIds: nextSongIds,
      publicSongs: targetSetlist.publicShareEnabled ? buildPublicSongs(nextSongIds, bandSongs) : targetSetlist.publicSongs,
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
      await dataClient.bandSetlists.update(bandId, nextSetlist);
      return null;
    } catch (error) {
      setBandSetlistsByBandId((prev) => ({
        ...prev,
        [bandId]: previousSetlists,
      }));
      return error instanceof Error ? error.message : 'Failed to reorder band setlist.';
    }
  }, [bandSetlistsByBandId, bandSongsByBandId, bands, userId]);

  const updateSongNoteInBandSetlist = useCallback(async (
    bandId: string,
    setlistId: string,
    songId: string,
    note: string
  ) => {
    if (!userId) {
      return 'Band setlists require a signed-in account.';
    }

    const band = bands.find((entry) => entry.id === bandId);
    if (!band) return 'Band not found.';

    const isMember = band.memberIds.includes(userId);
    if (!isMember) return 'You do not have permission to edit this band.';

    const previousSetlists = bandSetlistsByBandId[bandId] ?? [];
    const targetSetlist = previousSetlists.find((setlist) => setlist.id === setlistId);
    if (!targetSetlist) return null;
    if (!targetSetlist.songIds.includes(songId)) return null;

    const normalizedNote = note.trim();
    const previousNote = targetSetlist.songNotes?.[songId] ?? '';
    if (normalizedNote === previousNote) {
      return null;
    }

    const now = new Date().toISOString();
    const nextSongNotes = { ...(targetSetlist.songNotes ?? {}) };
    if (normalizedNote) {
      nextSongNotes[songId] = normalizedNote;
    } else {
      delete nextSongNotes[songId];
    }

    const nextSetlist = {
      ...targetSetlist,
      songNotes: Object.keys(nextSongNotes).length > 0 ? nextSongNotes : undefined,
      publicSongNotes: targetSetlist.publicShareEnabled ? (Object.keys(nextSongNotes).length > 0 ? nextSongNotes : {}) : targetSetlist.publicSongNotes,
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
      await dataClient.bandSetlists.update(bandId, nextSetlist);
      return null;
    } catch (error) {
      setBandSetlistsByBandId((prev) => ({
        ...prev,
        [bandId]: previousSetlists,
      }));
      return error instanceof Error ? error.message : 'Failed to update band setlist song note.';
    }
  }, [bandSetlistsByBandId, bands, userId]);

  const addBandInputList = useCallback(async (bandId: string, name: string) => {
    if (!userId || !user?.email) {
      return { riderId: null, error: 'Band riders require cloud sync.' };
    }

    const band = bands.find((entry) => entry.id === bandId);
    if (!band) return { riderId: null, error: 'Band not found.' };

    const isMember = band.memberIds.includes(userId);
    if (!isMember) return { riderId: null, error: 'You do not have permission to edit this band.' };

    const currentRiders = bandInputListsByBandId[bandId] ?? [];

    // Self-host has no plans/billing, so no rider limit applies there.
    if (!isSelfHost) {
      if (!bandCanUse(band, 'technicalRiders', user?.plan, user?.subscriptionStatus, user?.planOverride)) {
        return { riderId: null, error: 'Technical riders require a Pro or Crew plan for this band.' };
      }

      const riderLimit = resolveResourceLimit(band, 'riderLimit', user?.plan, user?.subscriptionStatus, user?.planOverride);
      if (riderLimit !== null && currentRiders.length >= riderLimit) {
        return { riderId: null, error: `This band has reached the ${riderLimit}-technical-rider limit for the Free plan. Upgrade to Pro or Crew for unlimited technical riders.` };
      }
    }

    const trimmed = name.trim();
    if (!trimmed) return { riderId: null, error: 'Rider name is required.' };

    const now = new Date().toISOString();
    const draftRider: InputList = {
      id: crypto.randomUUID(),
      name: trimmed,
      ownerId: band.ownerId,
      accessRole: 'owner',
      bandName: band.name,
      sortOrder: currentRiders.length,
      createdAt: now,
      updatedAt: now,
    };

    try {
      const newRider = await dataClient.bandRiders.create(bandId, draftRider);

      setBandInputListsByBandId((prev) => ({
        ...prev,
        [bandId]: [...(prev[bandId] ?? []), newRider],
      }));

      return { riderId: newRider.id, error: null };
    } catch (error) {
      return { riderId: null, error: error instanceof Error ? error.message : 'Failed to create technical rider.' };
    }
  }, [bands, bandInputListsByBandId, userId, user?.email, user?.plan, user?.subscriptionStatus, user?.planOverride]);

  const renameBandInputList = useCallback(async (bandId: string, riderId: string, name: string) => {
    if (!userId) {
      return 'Band riders require cloud sync.';
    }

    const band = bands.find((entry) => entry.id === bandId);
    if (!band) return 'Band not found.';

    const isEditor = band.ownerId === userId || band.memberRoles[userId] === 'editor';
    if (!isEditor) return 'You do not have permission to edit this band.';

    const trimmed = name.trim();
    if (!trimmed) return 'Rider name is required.';

    const previousRiders = bandInputListsByBandId[bandId] ?? [];
    const target = previousRiders.find((rider) => rider.id === riderId);
    if (!target) return 'Input list not found.';

    const now = new Date().toISOString();
    const nextRider: InputList = { ...target, name: trimmed, updatedAt: now };
    const nextRiders = previousRiders.map((rider) => (rider.id === riderId ? nextRider : rider));

    setBandInputListsByBandId((prev) => ({
      ...prev,
      [bandId]: nextRiders,
    }));

    try {
      await dataClient.bandRiders.update(bandId, nextRider);
      return null;
    } catch (error) {
      setBandInputListsByBandId((prev) => ({
        ...prev,
        [bandId]: previousRiders,
      }));
      return error instanceof Error ? error.message : 'Failed to rename input list.';
    }
  }, [bandInputListsByBandId, bands, userId]);

  const updateBandInputListIcon = useCallback(async (bandId: string, riderId: string, icon?: string) => {
    if (!userId) {
      return 'Band riders require cloud sync.';
    }

    const band = bands.find((entry) => entry.id === bandId);
    if (!band) return 'Band not found.';

    const isEditor = band.ownerId === userId || band.memberRoles[userId] === 'editor';
    if (!isEditor) return 'You do not have permission to edit this band.';

    const previousRiders = bandInputListsByBandId[bandId] ?? [];
    const target = previousRiders.find((rider) => rider.id === riderId);
    if (!target) return 'Input list not found.';

    const now = new Date().toISOString();
    const nextRider: InputList = { ...target, icon, updatedAt: now };
    const nextRiders = previousRiders.map((rider) => (rider.id === riderId ? nextRider : rider));

    setBandInputListsByBandId((prev) => ({
      ...prev,
      [bandId]: nextRiders,
    }));

    try {
      await dataClient.bandRiders.update(bandId, nextRider);
      return null;
    } catch (error) {
      setBandInputListsByBandId((prev) => ({
        ...prev,
        [bandId]: previousRiders,
      }));
      return error instanceof Error ? error.message : 'Failed to update input list icon.';
    }
  }, [bandInputListsByBandId, bands, userId]);

  const setBandInputListPublicShare = useCallback(async (bandId: string, riderId: string, enabled: boolean) => {
    if (!userId) {
      return 'Band riders require cloud sync.';
    }

    const band = bands.find((entry) => entry.id === bandId);
    if (!band) return 'Band not found.';

    const isEditor = band.ownerId === userId || band.memberRoles[userId] === 'editor';
    if (!isEditor) return 'You do not have permission to edit this band.';

    if (enabled && !isSelfHost && !bandCanUse(band, 'shareableLinks', user?.plan, user?.subscriptionStatus, user?.planOverride)) {
      return 'Shareable public links require a Pro or Crew plan for this band.';
    }

    const previousRiders = bandInputListsByBandId[bandId] ?? [];
    const target = previousRiders.find((rider) => rider.id === riderId);
    if (!target) return 'Input list not found.';

    const now = new Date().toISOString();
    const nextRider: InputList = {
      ...target,
      publicShareEnabled: enabled || undefined,
      bandName: enabled ? band.name : undefined,
      updatedAt: now,
    };
    const nextRiders = previousRiders.map((rider) => (rider.id === riderId ? nextRider : rider));

    setBandInputListsByBandId((prev) => ({
      ...prev,
      [bandId]: nextRiders,
    }));

    try {
      await dataClient.bandRiders.update(bandId, nextRider);
      return null;
    } catch (error) {
      setBandInputListsByBandId((prev) => ({
        ...prev,
        [bandId]: previousRiders,
      }));
      return error instanceof Error ? error.message : 'Failed to update input list sharing.';
    }
  }, [bandInputListsByBandId, bands, userId, user?.plan, user?.subscriptionStatus, user?.planOverride]);

  const updateBandInputListContent = useCallback(async (params: {
    bandId: string;
    riderId: string;
    hospitalityNotes: string;
    logisticsNotes: string;
  }) => {
    const { bandId, riderId, hospitalityNotes, logisticsNotes } = params;

    if (!userId) {
      return 'Band riders require cloud sync.';
    }

    const band = bands.find((entry) => entry.id === bandId);
    if (!band) return 'Band not found.';

    const isEditor = band.ownerId === userId || band.memberRoles[userId] === 'editor';
    if (!isEditor) return 'You do not have permission to edit this band.';

    const previousRiders = bandInputListsByBandId[bandId] ?? [];
    const target = previousRiders.find((rider) => rider.id === riderId);
    if (!target) return 'Input list not found.';

    const now = new Date().toISOString();
    const nextRider: InputList = {
      ...target,
      hospitalityNotes: hospitalityNotes || undefined,
      logisticsNotes: logisticsNotes || undefined,
      updatedAt: now,
    };
    const nextRiders = previousRiders.map((rider) => (rider.id === riderId ? nextRider : rider));

    setBandInputListsByBandId((prev) => ({
      ...prev,
      [bandId]: nextRiders,
    }));

    try {
      await dataClient.bandRiders.update(bandId, nextRider);
      return null;
    } catch (error) {
      setBandInputListsByBandId((prev) => ({
        ...prev,
        [bandId]: previousRiders,
      }));
      return error instanceof Error ? error.message : 'Failed to update input list.';
    }
  }, [bandInputListsByBandId, bands, userId]);

  const updateBandInputListStageplotContent = useCallback(async (params: {
    bandId: string;
    riderId: string;
    items: StageplotItem[];
    drawingLayers: SongHandNoteDocument[];
  }) => {
    const { bandId, riderId, items, drawingLayers } = params;

    if (!userId) {
      return 'Band riders require cloud sync.';
    }

    const band = bands.find((entry) => entry.id === bandId);
    if (!band) return 'Band not found.';

    const isEditor = band.ownerId === userId || band.memberRoles[userId] === 'editor';
    if (!isEditor) return 'You do not have permission to edit this band.';

    const previousRiders = bandInputListsByBandId[bandId] ?? [];
    const target = previousRiders.find((rider) => rider.id === riderId);
    if (!target) return 'Technical rider not found.';

    const now = new Date().toISOString();
    const sanitizedItems = items.map((item) => stripUndefinedFields(item));
    const sanitizedDrawingLayers = drawingLayers.map((layer) => ({
      ...stripUndefinedFields(layer),
      viewport: stripUndefinedFields(layer.viewport),
      strokes: layer.strokes.map((stroke) => stripUndefinedFields(stroke)),
    }));

    const nextRider: InputList = {
      ...target,
      items: sanitizedItems,
      drawingLayers: sanitizedDrawingLayers,
      updatedAt: now,
    };
    const nextRiders = previousRiders.map((rider) => (rider.id === riderId ? nextRider : rider));

    setBandInputListsByBandId((prev) => ({
      ...prev,
      [bandId]: nextRiders,
    }));

    try {
      await dataClient.bandRiders.update(bandId, nextRider);
      return null;
    } catch (error) {
      setBandInputListsByBandId((prev) => ({
        ...prev,
        [bandId]: previousRiders,
      }));
      return error instanceof Error ? error.message : 'Failed to update stageplot data.';
    }
  }, [bandInputListsByBandId, bands, userId]);

  const deleteBandInputList = useCallback(async (bandId: string, riderId: string) => {
    if (!userId) {
      return 'Band riders require cloud sync.';
    }

    const band = bands.find((entry) => entry.id === bandId);
    if (!band) return 'Band not found.';

    const isEditor = band.ownerId === userId || band.memberRoles[userId] === 'editor';
    if (!isEditor) return 'You do not have permission to edit this band.';

    const previousRiders = bandInputListsByBandId[bandId] ?? [];
    const riderToDelete = previousRiders.find((rider) => rider.id === riderId);
    if (!riderToDelete) {
      return null;
    }

    const { deletedAt, purgeAt } = createTrashTimestamps();
    const trashId = crypto.randomUUID();
    const nextRiders = withSequentialInputListSortOrder(sortInputLists(
      previousRiders.filter((rider) => rider.id !== riderId)
    ));

    setBandInputListsByBandId((prev) => ({
      ...prev,
      [bandId]: nextRiders,
    }));
    setBandTrashByBandId((prev) => ({
      ...prev,
      [bandId]: [
        {
          bandId,
          trashId,
          itemType: 'technicalRider' as const,
          deletedAt,
          purgeAt,
          inputList: riderToDelete,
        },
        ...(prev[bandId] ?? []),
      ].sort(compareTrashByDeletedAtDesc),
    }));

    try {
      // Band trash is out of scope for the self-host backend; keep it Firestore-only.
      if (db) {
        await setDoc(
          doc(db, BANDS_COLLECTION, bandId, TRASH_COLLECTION, trashId),
          createTrashPayload('technicalRider', deletedAt, purgeAt, riderToDelete)
        );
      }
      await Promise.all([
        dataClient.bandRiders.remove(bandId, riderId),
        ...nextRiders.map((rider) => dataClient.bandRiders.update(bandId, rider)),
      ]);
      return null;
    } catch (error) {
      setBandInputListsByBandId((prev) => ({
        ...prev,
        [bandId]: previousRiders,
      }));
      setBandTrashByBandId((prev) => ({
        ...prev,
        [bandId]: (prev[bandId] ?? []).filter((entry) => entry.trashId !== trashId),
      }));
      return error instanceof Error ? error.message : 'Failed to move input list to trash.';
    }
  }, [bandInputListsByBandId, bands, userId]);

  /**
   * Restores a trashed band item via `dataClient.bandTrash` (self-host's Express/Postgres
   * backend, or the equivalent extracted Firestore logic in `firebaseClient.ts` for the
   * hosted SaaS — see `restoreTrashRecord` there), then refetches the affected band
   * collections from the same source of truth rather than hand-rolling an optimistic
   * per-item-type local patch. Slightly less snappy than the old inline-Firestore version
   * (a network round trip before the UI updates instead of instant local state), but works
   * identically for both backends and removes ~450 lines of duplicated per-type Firestore
   * write logic that now lives once, in `firebaseClient.ts`/`apiClient.ts`.
   */
  const restoreBandTrashItem = useCallback(async (bandId: string, trashId: string): Promise<string | null> => {
    if (!userId) {
      return 'Band libraries require cloud sync.';
    }

    const band = bands.find((entry) => entry.id === bandId);
    if (!band) return 'Band not found.';

    const isMember = band.memberIds.includes(userId);
    if (!isMember) {
      return 'You do not have permission to edit this band.';
    }

    const error = await dataClient.bandTrash.restore(bandId, trashId);
    if (error) return error;

    await Promise.all([
      refreshBandSongs(bandId),
      refreshBandSongLists(bandId),
      refreshBandSetlists(bandId),
      refreshBandInputLists(bandId),
      refreshBandTrash(bandId),
    ]).catch((refreshError) => {
      console.warn('Restored trash item, but failed to refresh band data.', refreshError);
    });

    return null;
  }, [bands, refreshBandInputLists, refreshBandSetlists, refreshBandSongLists, refreshBandSongs, refreshBandTrash, userId]);

  const deleteBandTrashItemPermanently = useCallback(async (bandId: string, trashId: string): Promise<string | null> => {
    if (!userId) {
      return 'Band libraries require cloud sync.';
    }

    const band = bands.find((entry) => entry.id === bandId);
    if (!band) return 'Band not found.';

    if (band.ownerId !== userId) {
      return 'Only the band owner can permanently delete trash items.';
    }

    const error = await dataClient.bandTrash.remove(bandId, trashId);
    if (error) return error;

    await refreshBandTrash(bandId).catch((refreshError) => {
      console.warn('Deleted trash item, but failed to refresh band trash.', refreshError);
    });

    return null;
  }, [bands, refreshBandTrash, userId]);


  const value = useMemo<BandsContextValue>(() => ({
    bands,
    bandSongsByBandId,
    bandSongListsByBandId,
    bandSetlistsByBandId,
    bandInputListsByBandId,
    bandPressKitsByBandId,
    bandTrashByBandId,
    loading,
    cloudRequired: !firebaseEnabled,
    refreshBands,
    createBand,
    deleteBand,
    renameBand,
    updateBandDescription,
    removeMember,
    leaveBand,
    refreshBandSongs,
    refreshBandSongLists,
    refreshBandSetlists,
    refreshBandInputLists,
    refreshBandPressKits,
    refreshBandTrash,
    addSongToBandLibrary,
    updateBandSong,
    removeSongFromBandLibrary,
    updateBandLibraryAppearance,
    updateBandLogo,
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
    setBandSetlistPublicShare,
    deleteBandSetlist,
    addSongToBandSetlist,
    removeSongFromBandSetlist,
    moveSongInBandSetlist,
    updateSongNoteInBandSetlist,
    addBandPressKit,
    deleteBandPressKit,
    renameBandPressKit,
    updateBandPressKitIcon,
    addBandInputList,
    renameBandInputList,
    updateBandInputListIcon,
    setBandInputListPublicShare,
    updateBandInputListContent,
    updateBandInputListStageplotContent,
    deleteBandInputList,
    restoreBandTrashItem,
    deleteBandTrashItemPermanently,
  }), [
    addBandSetlist,
    addBandSongList,
    addBandInputList,
    bandInputListsByBandId,
    addSongToBandSetlist,
    addSongToBandSongList,
    addSongToBandLibrary,
    updateBandSong,
    bandSetlistsByBandId,
    bandSongListsByBandId,
    bandSongsByBandId,
    bandTrashByBandId,
    bands,
    refreshBands,
    createBand,
    deleteBandSetlist,
    deleteBandInputList,
    deleteBandSongList,
    deleteBandTrashItemPermanently,
    deleteBand,
    leaveBand,
    loading,
    moveSongInBandSetlist,
    updateSongNoteInBandSetlist,
    moveSongInBandSongList,
    moveBandSong,
    refreshBandSetlists,
    refreshBandSongLists,
    refreshBandInputLists,
    refreshBandTrash,
    renameBand,
    renameBandSetlist,
    renameBandSongList,
    updateBandLogo,
    renameBandInputList,
    updateBandDescription,
    updateBandSongListIcon,
    refreshBandSongs,
    removeMember,
    removeSongFromBandSetlist,
    removeSongFromBandSongList,
    removeSongFromBandLibrary,
    restoreBandTrashItem,
    updateBandLibraryAppearance,
    updateBandSetlistIcon,
    setBandInputListPublicShare,
    setBandSetlistPublicShare,
    updateBandInputListContent,
    updateBandInputListStageplotContent,
    updateBandInputListIcon,
    addBandPressKit,
    deleteBandPressKit,
    renameBandPressKit,
    updateBandPressKitIcon,
    refreshBandPressKits,
    bandPressKitsByBandId,
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

export function useOptionalBands() {
  return useContext(BandsContext);
}