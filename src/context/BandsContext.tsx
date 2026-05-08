/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { arrayUnion, collection, deleteDoc, deleteField, doc, getDocs, onSnapshot, query, setDoc, where } from 'firebase/firestore';
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import type {
  Band,
  CollaborationPermission,
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
} from '../types';
import { db, storage, firebaseEnabled } from '../lib/firebase';
import {
  cleanupLegacySoloDataOnServer,
  changeBandMemberRoleOnServer,
  createBandOnServer,
  deleteBandOnServer,
  inviteBandMemberOnServer,
  repairBandMembershipOnServer,
  removeBandMemberOnServer,
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
  TRASH_COLLECTION,
} from '../lib/trash';
import {
  normalizeInputList,
  sortInputLists,
  withSequentialRiderEquipmentSortOrder,
  withSequentialRiderLineSortOrder,
  withSequentialInputListSortOrder,
} from '../lib/inputLists';
import { useAuth } from './AuthContext';
import { moveIdBefore } from '../utils/arrayUtils';

const BANDS_COLLECTION = 'bands';
const BAND_SONGS_COLLECTION = 'songs';
const BAND_SONGLISTS_COLLECTION = 'songLists';
const BAND_SETLISTS_COLLECTION = 'setlists';
const BAND_INPUT_LISTS_COLLECTION = 'technicalRiders';
const BAND_PRESS_KITS_COLLECTION = 'pressKits';
const MIGRATION_MARKER_PREFIX = 'gigboy-bands-migration';
const SOLO_CLEANUP_MARKER = 'solo-cleanup-v1';
const SERVER_REPAIR_MARKER = 'server-repair-v1';
const CLIENT_REPAIR_MARKER = 'client-repair-v1';
const LEGACY_NAME_REPAIR_MARKER = 'legacy-name-repair-v1';

function readFirstNonEmptyString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
  }
  return null;
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

function compareBands(a: Band, b: Band) {
  const updatedAtA = a.updatedAt ?? a.createdAt;
  const updatedAtB = b.updatedAt ?? b.createdAt;
  if (updatedAtA !== updatedAtB) {
    return updatedAtB.localeCompare(updatedAtA);
  }
  return a.name.localeCompare(b.name);
}

function mergeBandsById(primary: Band[], secondary: Band[]) {
  const merged = new Map<string, Band>();
  primary.forEach((band) => merged.set(band.id, band));
  secondary.forEach((band) => {
    if (!merged.has(band.id)) {
      merged.set(band.id, band);
    }
  });
  return Array.from(merged.values()).sort(compareBands);
}

function canEditBandLibrary(band: Band, userId: string | null) {
  if (!userId) return false;
  return band.ownerId === userId || band.memberRoles[userId] === 'editor';
}

function normalizeBand(id: string, data: Record<string, unknown>): Band {
  const bandName = readFirstNonEmptyString(data.name, data.title) ?? 'Untitled band';

  return {
    id,
    name: bandName,
    description: typeof data.description === 'string' ? data.description : undefined,
    icon: typeof data.icon === 'string' ? data.icon : undefined,
    color: typeof data.color === 'string' ? data.color : undefined,
    logo: typeof data.logo === 'string' ? data.logo : undefined,
    logoStoragePath: typeof data.logoStoragePath === 'string' ? data.logoStoragePath : undefined,
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
    billingPlan: data.billingPlan === 'band' ? 'band' : data.billingPlan === 'free' ? 'free' : undefined,
    billingSubscriptionStatus:
      data.billingSubscriptionStatus === 'active'
      || data.billingSubscriptionStatus === 'trialing'
      || data.billingSubscriptionStatus === 'past_due'
      || data.billingSubscriptionStatus === 'canceled'
      || data.billingSubscriptionStatus === 'unpaid'
      || data.billingSubscriptionStatus === 'incomplete'
        ? data.billingSubscriptionStatus
        : undefined,
    billingCurrentPeriodEnd:
      typeof data.billingCurrentPeriodEnd === 'number' ? data.billingCurrentPeriodEnd : undefined,
    billingExtraMembers: typeof data.billingExtraMembers === 'number' ? data.billingExtraMembers : undefined,
    billingMemberLimit: typeof data.billingMemberLimit === 'number' ? data.billingMemberLimit : undefined,
    stripeSubscriptionId: typeof data.stripeSubscriptionId === 'string' ? data.stripeSubscriptionId : undefined,
    stripeBandItemId: typeof data.stripeBandItemId === 'string' ? data.stripeBandItemId : undefined,
    stripeExtraMembersItemId:
      typeof data.stripeExtraMembersItemId === 'string' ? data.stripeExtraMembersItemId : undefined,
    createdAt: typeof data.createdAt === 'string' ? data.createdAt : new Date(0).toISOString(),
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : undefined,
  };
}

function normalizeBandSong(id: string, data: Record<string, unknown>): Song {
  const title = readFirstNonEmptyString(data.title, data.name) ?? 'Untitled';
  const playbackUrl = readFirstNonEmptyString(
    data.playbackUrl,
    data.playbackURL,
    data.playback_url,
    data.mediaUrl,
    data.mediaURL,
    data.media_url
  ) ?? undefined;

  return {
    id,
    title,
    artist: typeof data.artist === 'string' ? data.artist : undefined,
    playbackUrl,
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
  const name = readFirstNonEmptyString(data.name, data.title) ?? 'Untitled songlist';

  return {
    id,
    name,
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
  const name = readFirstNonEmptyString(data.name, data.title) ?? 'Untitled setlist';

  return {
    id,
    name,
    icon: typeof data.icon === 'string' ? data.icon : undefined,
    songIds: Array.isArray(data.songIds)
      ? data.songIds.filter((entry): entry is string => typeof entry === 'string')
      : [],
    songNotes:
      typeof data.songNotes === 'object' && data.songNotes !== null
        ? Object.fromEntries(
            Object.entries(data.songNotes as Record<string, unknown>).filter(
              ([, value]) => typeof value === 'string'
            )
          ) as Record<string, string>
        : undefined,
    publicShareEnabled: data.publicShareEnabled === true ? true : undefined,
    publicSongs: Array.isArray(data.publicSongs)
      ? (data.publicSongs as unknown[]).filter((entry): entry is PublicSongEntry =>
          typeof entry === 'object' && entry !== null && typeof (entry as Record<string, unknown>).id === 'string'
        )
      : undefined,
    bandName: typeof data.bandName === 'string' ? data.bandName : undefined,
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
  | (TrashedInputList & { bandId: string });

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
  inviteMember: (bandId: string, recipientUsername: string, role: CollaborationPermission) => Promise<string | null>;
  changeMemberRole: (bandId: string, memberId: string, role: CollaborationPermission) => Promise<string | null>;
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
  updateBandLibraryIcon: (bandId: string, icon?: string) => Promise<string | null>;
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
    lines: InputList['lines'];
    preferredEquipment: InputList['preferredEquipment'];
    inventoryEquipment: InputList['inventoryEquipment'];
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
  const [soloCleanupUserId, setSoloCleanupUserId] = useState<string | null>(null);
  const [legacyNameRepairUserId, setLegacyNameRepairUserId] = useState<string | null>(null);

  // One-time cleanup for legacy solo data now that the app is bands-only.
  useEffect(() => {
    if (!userId || soloCleanupUserId === userId) return;
    if (hasMigrationMarker(SOLO_CLEANUP_MARKER, userId)) {
      setSoloCleanupUserId(userId);
      return;
    }

    setSoloCleanupUserId(userId);
    void cleanupLegacySoloDataOnServer({
      userId,
      userEmail,
    }).then((result) => {
      setMigrationMarker(SOLO_CLEANUP_MARKER, userId);
      if (result.deletedSoloBands > 0 || result.deletedUserDocs > 0) {
        console.info(
          `[Gigboy] Cleaned legacy solo data: bands=${result.deletedSoloBands}, userDocs=${result.deletedUserDocs}`
        );
      }
    }).catch((error) => {
      console.error('[Gigboy] Legacy solo cleanup failed:', error);
    });
  }, [soloCleanupUserId, userId, userEmail]);

  // Server-side recovery: re-associate this user to likely matching bands by ownerId/username/email.
  useEffect(() => {
    if (!userId || serverRepairUserId === userId) return;
    if (hasMigrationMarker(SERVER_REPAIR_MARKER, userId)) {
      setServerRepairUserId(userId);
      return;
    }

    setServerRepairUserId(userId);
    void repairBandMembershipOnServer({
      userId,
      userEmail,
      username: userUsername,
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

  // Repair legacy records that used non-canonical name/title fields.
  useEffect(() => {
    if (!db || !userId || legacyNameRepairUserId === userId) return;
    if (hasMigrationMarker(LEGACY_NAME_REPAIR_MARKER, userId)) {
      setLegacyNameRepairUserId(userId);
      return;
    }

    const firestore = db;
    setLegacyNameRepairUserId(userId);

    const repairLegacyNameFields = async () => {
      const ownedBandsSnapshot = await getDocs(
        query(collection(firestore, BANDS_COLLECTION), where('ownerId', '==', userId))
      );

      let repairedBandCount = 0;
      let repairedSongCount = 0;
      let repairedSongListCount = 0;
      let repairedSetlistCount = 0;

      await Promise.all(ownedBandsSnapshot.docs.map(async (bandDoc) => {
        const bandData = bandDoc.data() as Record<string, unknown>;
        const canonicalBandName = readFirstNonEmptyString(bandData.name, bandData.title);
        const shouldRepairBandName = typeof bandData.name !== 'string' && canonicalBandName !== null;

        if (shouldRepairBandName) {
          repairedBandCount += 1;
          await setDoc(doc(firestore, BANDS_COLLECTION, bandDoc.id), {
            name: canonicalBandName,
            updatedAt: new Date().toISOString(),
          }, { merge: true });
        }

        const [songsSnapshot, songListsSnapshot, setlistsSnapshot] = await Promise.all([
          getDocs(collection(firestore, BANDS_COLLECTION, bandDoc.id, BAND_SONGS_COLLECTION)),
          getDocs(collection(firestore, BANDS_COLLECTION, bandDoc.id, BAND_SONGLISTS_COLLECTION)),
          getDocs(collection(firestore, BANDS_COLLECTION, bandDoc.id, BAND_SETLISTS_COLLECTION)),
        ]);

        await Promise.all(songsSnapshot.docs.map(async (entry) => {
          const data = entry.data() as Record<string, unknown>;
          const canonicalTitle = readFirstNonEmptyString(data.title, data.name);
          const shouldRepairTitle = typeof data.title !== 'string' && canonicalTitle !== null;
          if (!shouldRepairTitle) return;

          repairedSongCount += 1;
          await setDoc(doc(firestore, BANDS_COLLECTION, bandDoc.id, BAND_SONGS_COLLECTION, entry.id), {
            title: canonicalTitle,
            updatedAt: new Date().toISOString(),
          }, { merge: true });
        }));

        await Promise.all(songListsSnapshot.docs.map(async (entry) => {
          const data = entry.data() as Record<string, unknown>;
          const canonicalName = readFirstNonEmptyString(data.name, data.title);
          const shouldRepairName = typeof data.name !== 'string' && canonicalName !== null;
          if (!shouldRepairName) return;

          repairedSongListCount += 1;
          await setDoc(doc(firestore, BANDS_COLLECTION, bandDoc.id, BAND_SONGLISTS_COLLECTION, entry.id), {
            name: canonicalName,
            updatedAt: new Date().toISOString(),
          }, { merge: true });
        }));

        await Promise.all(setlistsSnapshot.docs.map(async (entry) => {
          const data = entry.data() as Record<string, unknown>;
          const canonicalName = readFirstNonEmptyString(data.name, data.title);
          const shouldRepairName = typeof data.name !== 'string' && canonicalName !== null;
          if (!shouldRepairName) return;

          repairedSetlistCount += 1;
          await setDoc(doc(firestore, BANDS_COLLECTION, bandDoc.id, BAND_SETLISTS_COLLECTION, entry.id), {
            name: canonicalName,
            updatedAt: new Date().toISOString(),
          }, { merge: true });
        }));
      }));

      setMigrationMarker(LEGACY_NAME_REPAIR_MARKER, userId);

      if (repairedBandCount + repairedSongCount + repairedSongListCount + repairedSetlistCount > 0) {
        console.info(
          `[Gigboy] Repaired legacy name fields: bands=${repairedBandCount}, songs=${repairedSongCount}, songlists=${repairedSongListCount}, setlists=${repairedSetlistCount}`
        );
      }
    };

    void repairLegacyNameFields().catch((error) => {
      console.error('[Gigboy] Legacy name field repair failed:', error);
    });
  }, [legacyNameRepairUserId, userId]);

  const refreshBands = useCallback(async () => {
    if (!db || !userId) {
      setBands([]);
      return;
    }

    const [memberSnapshot, ownerSnapshot] = await Promise.all([
      getDocs(query(collection(db, BANDS_COLLECTION), where('memberIds', 'array-contains', userId))),
      getDocs(query(collection(db, BANDS_COLLECTION), where('ownerId', '==', userId))),
    ]);

    const memberBands = memberSnapshot.docs
      .map((entry) => normalizeBand(entry.id, entry.data() as Record<string, unknown>))
      .sort(compareBands);
    const ownerBands = ownerSnapshot.docs
      .map((entry) => normalizeBand(entry.id, entry.data() as Record<string, unknown>))
      .sort(compareBands);

    const nextBands = mergeBandsById(memberBands, ownerBands);
    setBands(nextBands);
  }, [userId]);

  useEffect(() => {
    if (!db || !userId) {
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

  const refreshBandInputLists = useCallback(async (bandId: string) => {
    if (!db || !userId) return;

    const snapshot = await getDocs(collection(db, BANDS_COLLECTION, bandId, BAND_INPUT_LISTS_COLLECTION));
    const riders = sortInputLists(
      snapshot.docs.map((entry) => normalizeInputList(entry.id, entry.data() as Record<string, unknown>))
    );

    setBandInputListsByBandId((prev) => ({
      ...prev,
      [bandId]: riders,
    }));
  }, [userId]);

  const refreshBandPressKits = useCallback(async (bandId: string) => {
    if (!db || !userId) return;
    const snapshot = await getDocs(collection(db, BANDS_COLLECTION, bandId, BAND_PRESS_KITS_COLLECTION));
    const kits: PressKit[] = snapshot.docs.map((entry) => {
      const data = entry.data() as Record<string, unknown>;
      return {
        id: entry.id,
        name: typeof data.name === 'string' ? data.name : 'Unnamed Kit',
        icon: typeof data.icon === 'string' ? data.icon : undefined,
        richText: typeof data.richText === 'string' ? data.richText : '',
        imageIds: Array.isArray(data.imageIds) ? (data.imageIds as string[]) : [],
        createdAt: typeof data.createdAt === 'string' ? data.createdAt : undefined,
      };
    });
    setBandPressKitsByBandId((prev) => ({ ...prev, [bandId]: kits }));
  }, [userId]);

  const addBandPressKit = useCallback(async (bandId: string, name: string): Promise<{ kitId: string | null; error: string | null }> => {
    if (!db || !userId) return { kitId: null, error: 'Not signed in.' };
    const kitId = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    try {
      await setDoc(doc(db, BANDS_COLLECTION, bandId, BAND_PRESS_KITS_COLLECTION, kitId), {
        name: name.trim(),
        richText: '',
        imageIds: [],
        createdAt,
        createdBy: userId,
      });
      setBandPressKitsByBandId((prev) => ({
        ...prev,
        [bandId]: [...(prev[bandId] ?? []), { id: kitId, name: name.trim(), richText: '', imageIds: [], createdAt }],
      }));
      return { kitId, error: null };
    } catch {
      return { kitId: null, error: 'Failed to create press kit.' };
    }
  }, [userId]);

  const deleteBandPressKit = useCallback(async (bandId: string, kitId: string): Promise<string | null> => {
    if (!db || !userId) return 'Not signed in.';
    try {
      await deleteDoc(doc(db, BANDS_COLLECTION, bandId, BAND_PRESS_KITS_COLLECTION, kitId));
      setBandPressKitsByBandId((prev) => ({
        ...prev,
        [bandId]: (prev[bandId] ?? []).filter((k) => k.id !== kitId),
      }));
      return null;
    } catch {
      return 'Failed to delete press kit.';
    }
  }, [userId]);

  const renameBandPressKit = useCallback(async (bandId: string, kitId: string, name: string): Promise<string | null> => {
    if (!db || !userId) return 'Band press kits require cloud sync.';
    const band = bands.find((entry) => entry.id === bandId);
    if (!band) return 'Band not found.';
    if (!band.memberIds.includes(userId)) return 'You do not have permission to edit this band.';
    const trimmed = name.trim();
    if (!trimmed) return 'Press kit name is required.';
    const previousKits = bandPressKitsByBandId[bandId] ?? [];
    const now = new Date().toISOString();
    setBandPressKitsByBandId((prev) => ({
      ...prev,
      [bandId]: (prev[bandId] ?? []).map((k) => k.id === kitId ? { ...k, name: trimmed, updatedAt: now } : k),
    }));
    try {
      await setDoc(doc(db, BANDS_COLLECTION, bandId, BAND_PRESS_KITS_COLLECTION, kitId), { name: trimmed, updatedAt: now }, { merge: true });
      return null;
    } catch (error) {
      setBandPressKitsByBandId((prev) => ({ ...prev, [bandId]: previousKits }));
      return error instanceof Error ? error.message : 'Failed to rename press kit.';
    }
  }, [bandPressKitsByBandId, bands, userId]);

  const updateBandPressKitIcon = useCallback(async (bandId: string, kitId: string, icon?: string): Promise<string | null> => {
    if (!db || !userId) return 'Band press kits require cloud sync.';
    const band = bands.find((entry) => entry.id === bandId);
    if (!band) return 'Band not found.';
    if (!band.memberIds.includes(userId)) return 'You do not have permission to edit this band.';
    const previousKits = bandPressKitsByBandId[bandId] ?? [];
    const now = new Date().toISOString();
    setBandPressKitsByBandId((prev) => ({
      ...prev,
      [bandId]: (prev[bandId] ?? []).map((k) => k.id === kitId ? { ...k, icon, updatedAt: now } : k),
    }));
    try {
      await setDoc(doc(db, BANDS_COLLECTION, bandId, BAND_PRESS_KITS_COLLECTION, kitId), { icon: icon ?? deleteField(), updatedAt: now }, { merge: true });
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
    ];

    const expiredItems = items.filter((entry) => isTrashExpired(entry.purgeAt, now));
    const activeItems = items.filter((entry) => !isTrashExpired(entry.purgeAt, now));

    if (expiredItems.length > 0) {
      void Promise.all(
        expiredItems.map((entry) => deleteDoc(doc(firestore, BANDS_COLLECTION, bandId, TRASH_COLLECTION, entry.trashId)))
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
      setBandTrashByBandId((prev) => {
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
        setBandTrashByBandId((prev) => {
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

  const updateBandDescription = useCallback(async (bandId: string, description: string) => {
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
      await setDoc(doc(db, BANDS_COLLECTION, bandId), {
        description: nextDescription ?? null,
        updatedAt: now,
      }, { merge: true });
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

  const updateBandLibraryIcon = useCallback(async (bandId: string, icon?: string) => {
    const band = bands.find((entry) => entry.id === bandId);
    return updateBandLibraryAppearance(bandId, {
      icon,
      color: band?.color,
    });
  }, [bands, updateBandLibraryAppearance]);

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

    if (!file) {
      // Remove logo
      const nextBands = bands
        .map((entry) => (entry.id === bandId ? { ...entry, logo: undefined, logoStoragePath: undefined, updatedAt: now } : entry))
        .sort(compareBands);

      setBands(nextBands);

      try {
        await setDoc(doc(db, BANDS_COLLECTION, bandId), {
          logo: deleteField(),
          logoStoragePath: deleteField(),
          updatedAt: now,
        }, { merge: true });

        // Delete the old file from storage if it exists
        if (band.logoStoragePath) {
          try {
            await deleteObject(ref(storage, band.logoStoragePath));
          } catch {
            // Ignore deletion errors
          }
        }

        // Remove from press kit images
        try {
          await deleteDoc(doc(db, 'bands', bandId, 'pressKitImages', logoImageId));
        } catch {
          // Ignore deletion errors
        }

        return null;
      } catch (error) {
        setBands(previousBands);
        return error instanceof Error ? error.message : 'Failed to remove band logo.';
      }
    }

    // Upload new logo
    try {
      const ext = file.name.includes('.') ? file.name.split('.').pop()?.toLowerCase() ?? 'bin' : 'bin';
      const logoStoragePath = `bands/${bandId}/logo.${ext}`;
      const storageRef = ref(storage, logoStoragePath);

      await uploadBytes(storageRef, file, { contentType: file.type || undefined });
      const logoUrl = await getDownloadURL(storageRef);

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
        storagePath: logoStoragePath,
        mimeType: file.type || 'image/jpeg',
        sizeBytes: file.size,
        createdAt: now,
        createdBy: userId,
      });

      return null;
    } catch (error) {
      setBands(previousBands);
      return error instanceof Error ? error.message : 'Failed to upload band logo.';
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

    const isMember = band.memberIds.includes(userId);
    if (!isMember) {
      return 'You do not have permission to edit this band library.';
    }

    const songId = song.id || crypto.randomUUID();
    const currentBandSongs = bandSongsByBandId[bandId] ?? [];
    const nextSortOrder = currentBandSongs.reduce((max, entry) => {
      if (typeof entry.sortOrder !== 'number') return max;
      return Math.max(max, entry.sortOrder);
    }, -1) + 1;
    const payload = Object.fromEntries(
      Object.entries({
        ...song,
        sortOrder: nextSortOrder,
        ownerId: band.ownerId,
        collaboratorIds: band.memberIds,
        collaborationPermissions: Object.fromEntries(
          band.memberIds.map((memberId) => [memberId, band.memberRoles[memberId] ?? 'viewer'])
        ),
        updatedAt: new Date().toISOString(),
      }).filter(([key, value]) => key !== 'id' && key !== 'accessRole' && value !== undefined)
    );

    try {
      await setDoc(doc(db, BANDS_COLLECTION, bandId, BAND_SONGS_COLLECTION, songId), payload);
      await refreshBandSongs(bandId);
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : 'Failed to add song to band library.';
    }
  }, [bandSongsByBandId, bands, refreshBandSongs, userId]);

  const updateBandSong = useCallback(async (bandId: string, song: Song) => {
    if (!db || !userId) {
      return 'Band libraries require cloud sync.';
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
      const payload = Object.fromEntries(
        Object.entries(nextSong).filter(([key, value]) => key !== 'id' && key !== 'accessRole' && value !== undefined)
      );
      await setDoc(doc(db, BANDS_COLLECTION, bandId, BAND_SONGS_COLLECTION, nextSong.id), payload);
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
    if (!db || !userId) {
      return 'Band libraries require cloud sync.';
    }

    const firestore = db;

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
      await Promise.all([
        setDoc(
          doc(firestore, BANDS_COLLECTION, bandId, TRASH_COLLECTION, trashId),
          createTrashPayload('song', deletedAt, purgeAt, songToDelete)
        ),
        deleteDoc(doc(firestore, BANDS_COLLECTION, bandId, BAND_SONGS_COLLECTION, songId)),
      ]);
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
    if (!db || !userId) {
      return 'Band libraries require cloud sync.';
    }

    const firestore = db;

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
      await Promise.all(
        nextSongs.map((song) => {
          const payload = Object.fromEntries(
            Object.entries(song).filter(([key, value]) => key !== 'id' && key !== 'accessRole' && value !== undefined)
          );
          return setDoc(doc(firestore, BANDS_COLLECTION, bandId, BAND_SONGS_COLLECTION, song.id), payload);
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
      const payload = Object.fromEntries(
        Object.entries(nextSongList).filter(([key, value]) => key !== 'id' && key !== 'accessRole' && value !== undefined)
      );
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

    const isMember = band.memberIds.includes(userId);
    if (!isMember) {
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

    const isMember = band.memberIds.includes(userId);
    if (!isMember) {
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
        icon: icon ?? deleteField(),
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
      await Promise.all([
        setDoc(
          doc(firestore, BANDS_COLLECTION, bandId, TRASH_COLLECTION, trashId),
          createTrashPayload('songlist', deletedAt, purgeAt, songListToDelete)
        ),
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
      setBandTrashByBandId((prev) => ({
        ...prev,
        [bandId]: (prev[bandId] ?? []).filter((entry) => entry.trashId !== trashId),
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

    const isMember = band.memberIds.includes(userId);
    if (!isMember) {
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
      const payload = Object.fromEntries(
        Object.entries(nextSetlist).filter(([key, value]) => key !== 'id' && key !== 'accessRole' && value !== undefined)
      );
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

    const isMember = band.memberIds.includes(userId);
    if (!isMember) return 'You do not have permission to edit this band.';

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

    const isMember = band.memberIds.includes(userId);
    if (!isMember) return 'You do not have permission to edit this band.';

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
        icon: icon ?? deleteField(),
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
  }, [bandSetlistsByBandId, bandSongsByBandId, bands, userId]);

  const deleteBandSetlist = useCallback(async (bandId: string, setlistId: string) => {
    if (!db || !userId) {
      return 'Band setlists require cloud sync.';
    }

    const firestore = db;

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
      await Promise.all([
        setDoc(
          doc(firestore, BANDS_COLLECTION, bandId, TRASH_COLLECTION, trashId),
          createTrashPayload('setlist', deletedAt, purgeAt, setlistToDelete)
        ),
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
      setBandTrashByBandId((prev) => ({
        ...prev,
        [bandId]: (prev[bandId] ?? []).filter((entry) => entry.trashId !== trashId),
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

    const isMember = band.memberIds.includes(userId);
    if (!isMember) return 'You do not have permission to edit this band.';

    const now = new Date().toISOString();
    const bandSongs = bandSongsByBandId[bandId] ?? [];
    const previousSetlists = bandSetlistsByBandId[bandId] ?? [];
    const targetSetlist = previousSetlists.find((setlist) => setlist.id === setlistId);
    if (!targetSetlist || targetSetlist.songIds.includes(songId)) return null;

    const nextSongIds = [...targetSetlist.songIds, songId];
    const nextPublicSongs = targetSetlist.publicShareEnabled
      ? buildPublicSongs(nextSongIds, bandSongs)
      : targetSetlist.publicSongs;

    setBandSetlistsByBandId((prev) => {
      const currentSetlists = prev[bandId] ?? [];
      const currentTargetSetlist = currentSetlists.find((setlist) => setlist.id === setlistId);
      if (!currentTargetSetlist || currentTargetSetlist.songIds.includes(songId)) return prev;

      const nextCurrentSongIds = [...currentTargetSetlist.songIds, songId];
      const nextSetlist = {
        ...currentTargetSetlist,
        songIds: nextCurrentSongIds,
        publicSongs: currentTargetSetlist.publicShareEnabled
          ? buildPublicSongs(nextCurrentSongIds, bandSongs)
          : currentTargetSetlist.publicSongs,
        updatedAt: now,
      };
      const nextSetlists = currentSetlists.map((setlist) => (
        setlist.id === setlistId ? nextSetlist : setlist
      ));

      return {
        ...prev,
        [bandId]: nextSetlists,
      };
    });

    try {
      const updatePayload: Record<string, unknown> = {
        songIds: arrayUnion(songId),
        updatedAt: now,
      };
      if (targetSetlist.publicShareEnabled) {
        updatePayload.publicSongs = nextPublicSongs ?? null;
      }
      await setDoc(doc(db, BANDS_COLLECTION, bandId, BAND_SETLISTS_COLLECTION, setlistId), updatePayload, { merge: true });
      return null;
    } catch (error) {
      await refreshBandSetlists(bandId);
      return error instanceof Error ? error.message : 'Failed to update band setlist.';
    }
  }, [bandSetlistsByBandId, bandSongsByBandId, bands, refreshBandSetlists, userId]);

  const removeSongFromBandSetlist = useCallback(async (bandId: string, setlistId: string, songId: string) => {
    if (!db || !userId) {
      return 'Band setlists require cloud sync.';
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
      const updatePayload: Record<string, unknown> = {
        songIds: nextSetlist.songIds,
        songNotes: nextSetlist.songNotes ?? null,
        updatedAt: now,
      };
      if (targetSetlist.publicShareEnabled) {
        updatePayload.publicSongs = nextSetlist.publicSongs ?? null;
      }
      await setDoc(doc(db, BANDS_COLLECTION, bandId, BAND_SETLISTS_COLLECTION, setlistId), updatePayload, { merge: true });
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
    if (!db || !userId) {
      return 'Band setlists require cloud sync.';
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
      const updatePayload: Record<string, unknown> = {
        songIds: nextSongIds,
        updatedAt: now,
      };
      if (targetSetlist.publicShareEnabled) {
        updatePayload.publicSongs = nextSetlist.publicSongs ?? null;
      }
      await setDoc(doc(db, BANDS_COLLECTION, bandId, BAND_SETLISTS_COLLECTION, setlistId), updatePayload, { merge: true });
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
    if (!db || !userId) {
      return 'Band setlists require cloud sync.';
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
      const updateData: Record<string, unknown> = {
        songNotes: nextSetlist.songNotes ?? null,
        updatedAt: now,
      };
      if (targetSetlist.publicShareEnabled) {
        updateData.publicSongNotes = nextSetlist.songNotes ?? null;
      }
      await setDoc(doc(db, BANDS_COLLECTION, bandId, BAND_SETLISTS_COLLECTION, setlistId), updateData, { merge: true });
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
    if (!db || !userId) {
      return { riderId: null, error: 'Band riders require cloud sync.' };
    }

    const firestore = db;

    const band = bands.find((entry) => entry.id === bandId);
    if (!band) return { riderId: null, error: 'Band not found.' };

    const isMember = band.memberIds.includes(userId);
    if (!isMember) return { riderId: null, error: 'You do not have permission to edit this band.' };

    const trimmed = name.trim();
    if (!trimmed) return { riderId: null, error: 'Rider name is required.' };

    const now = new Date().toISOString();
    const riderId = crypto.randomUUID();
    const previousRiders = bandInputListsByBandId[bandId] ?? [];
    const nextRider: InputList = {
      id: riderId,
      name: trimmed,
      lines: [],
      preferredEquipment: [],
      inventoryEquipment: [],
      ownerId: band.ownerId,
      accessRole: 'owner',
      bandName: band.name,
      createdAt: now,
      updatedAt: now,
    };

    const nextRiders = withSequentialInputListSortOrder(sortInputLists([...previousRiders, nextRider]));

    setBandInputListsByBandId((prev) => ({
      ...prev,
      [bandId]: nextRiders,
    }));

    try {
      await Promise.all(nextRiders.map((rider) => setDoc(
        doc(firestore, BANDS_COLLECTION, bandId, BAND_INPUT_LISTS_COLLECTION, rider.id),
        {
          name: rider.name,
          icon: rider.icon ?? null,
          lines: rider.lines,
          preferredEquipment: rider.preferredEquipment,
          inventoryEquipment: rider.inventoryEquipment,
          publicShareEnabled: rider.publicShareEnabled || null,
          bandName: rider.bandName ?? null,
          ownerId: rider.ownerId ?? null,
          sortOrder: rider.sortOrder ?? null,
          createdAt: rider.createdAt,
          updatedAt: rider.updatedAt,
        },
        { merge: true }
      )));

      return { riderId, error: null };
    } catch (error) {
      setBandInputListsByBandId((prev) => ({
        ...prev,
        [bandId]: previousRiders,
      }));
      return { riderId: null, error: error instanceof Error ? error.message : 'Failed to create input list.' };
    }
  }, [bandInputListsByBandId, bands, userId]);

  const renameBandInputList = useCallback(async (bandId: string, riderId: string, name: string) => {
    if (!db || !userId) {
      return 'Band riders require cloud sync.';
    }

    const band = bands.find((entry) => entry.id === bandId);
    if (!band) return 'Band not found.';

    const isMember = band.memberIds.includes(userId);
    if (!isMember) return 'You do not have permission to edit this band.';

    const trimmed = name.trim();
    if (!trimmed) return 'Rider name is required.';

    const previousRiders = bandInputListsByBandId[bandId] ?? [];
    const now = new Date().toISOString();
    const nextRiders = previousRiders.map((rider) => (
      rider.id === riderId ? { ...rider, name: trimmed, updatedAt: now } : rider
    ));

    setBandInputListsByBandId((prev) => ({
      ...prev,
      [bandId]: nextRiders,
    }));

    try {
      await setDoc(doc(db, BANDS_COLLECTION, bandId, BAND_INPUT_LISTS_COLLECTION, riderId), {
        name: trimmed,
        updatedAt: now,
      }, { merge: true });
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
    if (!db || !userId) {
      return 'Band riders require cloud sync.';
    }

    const band = bands.find((entry) => entry.id === bandId);
    if (!band) return 'Band not found.';

    const isMember = band.memberIds.includes(userId);
    if (!isMember) return 'You do not have permission to edit this band.';

    const previousRiders = bandInputListsByBandId[bandId] ?? [];
    const now = new Date().toISOString();
    const nextRiders = previousRiders.map((rider) => (
      rider.id === riderId ? { ...rider, icon, updatedAt: now } : rider
    ));

    setBandInputListsByBandId((prev) => ({
      ...prev,
      [bandId]: nextRiders,
    }));

    try {
      await setDoc(doc(db, BANDS_COLLECTION, bandId, BAND_INPUT_LISTS_COLLECTION, riderId), {
        icon: icon ?? deleteField(),
        updatedAt: now,
      }, { merge: true });
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
    if (!db || !userId) {
      return 'Band riders require cloud sync.';
    }

    const band = bands.find((entry) => entry.id === bandId);
    if (!band) return 'Band not found.';

    const isMember = band.memberIds.includes(userId);
    if (!isMember) return 'You do not have permission to edit this band.';

    const previousRiders = bandInputListsByBandId[bandId] ?? [];
    const now = new Date().toISOString();
    const nextRiders = previousRiders.map((rider) => (
      rider.id === riderId
        ? { ...rider, publicShareEnabled: enabled || undefined, bandName: enabled ? band.name : undefined, updatedAt: now }
        : rider
    ));

    setBandInputListsByBandId((prev) => ({
      ...prev,
      [bandId]: nextRiders,
    }));

    try {
      await setDoc(doc(db, BANDS_COLLECTION, bandId, BAND_INPUT_LISTS_COLLECTION, riderId), {
        publicShareEnabled: enabled || null,
        bandName: enabled ? band.name : null,
        updatedAt: now,
      }, { merge: true });
      return null;
    } catch (error) {
      setBandInputListsByBandId((prev) => ({
        ...prev,
        [bandId]: previousRiders,
      }));
      return error instanceof Error ? error.message : 'Failed to update input list sharing.';
    }
  }, [bandInputListsByBandId, bands, userId]);

  const updateBandInputListContent = useCallback(async (params: {
    bandId: string;
    riderId: string;
    lines: InputList['lines'];
    preferredEquipment: InputList['preferredEquipment'];
    inventoryEquipment: InputList['inventoryEquipment'];
  }) => {
    const { bandId, riderId, lines, preferredEquipment, inventoryEquipment } = params;

    if (!db || !userId) {
      return 'Band riders require cloud sync.';
    }

    const band = bands.find((entry) => entry.id === bandId);
    if (!band) return 'Band not found.';

    const isMember = band.memberIds.includes(userId);
    if (!isMember) return 'You do not have permission to edit this band.';

    const previousRiders = bandInputListsByBandId[bandId] ?? [];
    const target = previousRiders.find((rider) => rider.id === riderId);
    if (!target) return 'Input list not found.';

    const now = new Date().toISOString();
    const nextRiders = previousRiders.map((rider) => (
      rider.id === riderId
        ? {
            ...rider,
            lines: withSequentialRiderLineSortOrder(lines),
            preferredEquipment: withSequentialRiderEquipmentSortOrder(preferredEquipment),
            inventoryEquipment: withSequentialRiderEquipmentSortOrder(inventoryEquipment),
            updatedAt: now,
          }
        : rider
    ));

    const next = nextRiders.find((rider) => rider.id === riderId);

    setBandInputListsByBandId((prev) => ({
      ...prev,
      [bandId]: nextRiders,
    }));

    try {
      await setDoc(doc(db, BANDS_COLLECTION, bandId, BAND_INPUT_LISTS_COLLECTION, riderId), {
        lines: next?.lines ?? [],
        preferredEquipment: next?.preferredEquipment ?? [],
        inventoryEquipment: next?.inventoryEquipment ?? [],
        updatedAt: now,
      }, { merge: true });
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

    if (!db || !userId) {
      return 'Band riders require cloud sync.';
    }

    const band = bands.find((entry) => entry.id === bandId);
    if (!band) return 'Band not found.';

    const isMember = band.memberIds.includes(userId);
    if (!isMember) return 'You do not have permission to edit this band.';

    const previousRiders = bandInputListsByBandId[bandId] ?? [];
    const target = previousRiders.find((rider) => rider.id === riderId);
    if (!target) return 'Technical rider not found.';

    const now = new Date().toISOString();
    const nextRiders = previousRiders.map((rider) => (
      rider.id === riderId ? { ...rider, items, drawingLayers, updatedAt: now } : rider
    ));

    setBandInputListsByBandId((prev) => ({
      ...prev,
      [bandId]: nextRiders,
    }));

    try {
      await setDoc(doc(db, BANDS_COLLECTION, bandId, BAND_INPUT_LISTS_COLLECTION, riderId), {
        items,
        drawingLayers,
        updatedAt: now,
      }, { merge: true });
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
    if (!db || !userId) {
      return 'Band riders require cloud sync.';
    }

    const firestore = db;

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
      await Promise.all([
        setDoc(
          doc(firestore, BANDS_COLLECTION, bandId, TRASH_COLLECTION, trashId),
          createTrashPayload('technicalRider', deletedAt, purgeAt, riderToDelete)
        ),
        deleteDoc(doc(firestore, BANDS_COLLECTION, bandId, BAND_INPUT_LISTS_COLLECTION, riderId)),
        ...nextRiders.map((rider) => setDoc(
          doc(firestore, BANDS_COLLECTION, bandId, BAND_INPUT_LISTS_COLLECTION, rider.id),
          { sortOrder: rider.sortOrder ?? 0 },
          { merge: true }
        )),
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

  const restoreBandTrashItem = useCallback(async (bandId: string, trashId: string): Promise<string | null> => {
    if (!db || !userId) {
      return 'Band libraries require cloud sync.';
    }

    const firestore = db;

    const band = bands.find((entry) => entry.id === bandId);
    if (!band) return 'Band not found.';

    const isMember = band.memberIds.includes(userId);
    if (!isMember) {
      return 'You do not have permission to edit this band.';
    }

    const trashItems = bandTrashByBandId[bandId] ?? [];
    const target = trashItems.find((entry) => entry.trashId === trashId);
    if (!target) return 'Trash item not found.';

    setBandTrashByBandId((prev) => ({
      ...prev,
      [bandId]: (prev[bandId] ?? []).filter((entry) => entry.trashId !== trashId),
    }));

    if (target.itemType === 'song') {
      const previousSongs = bandSongsByBandId[bandId] ?? [];
      const restoredSong = { ...target.song };
      const nextSongs = sortBandSongs([...previousSongs.filter((entry) => entry.id !== restoredSong.id), restoredSong]);

      setBandSongsByBandId((prev) => ({
        ...prev,
        [bandId]: nextSongs,
      }));

      try {
        const { id, accessRole: _accessRole, ...rest } = restoredSong;
        void _accessRole;
        const payload = Object.fromEntries(
          Object.entries(rest).filter(([, value]) => value !== undefined)
        );

        await Promise.all([
          setDoc(doc(firestore, BANDS_COLLECTION, bandId, BAND_SONGS_COLLECTION, id), payload),
          deleteDoc(doc(firestore, BANDS_COLLECTION, bandId, TRASH_COLLECTION, trashId)),
        ]);

        return null;
      } catch (error) {
        setBandSongsByBandId((prev) => ({
          ...prev,
          [bandId]: previousSongs,
        }));
        setBandTrashByBandId((prev) => ({
          ...prev,
          [bandId]: [target, ...(prev[bandId] ?? [])].sort(compareTrashByDeletedAtDesc),
        }));
        return error instanceof Error ? error.message : 'Failed to restore band song.';
      }
    }

    if (target.itemType === 'songlist') {
      const previousSongLists = bandSongListsByBandId[bandId] ?? [];
      const restoredSongList: SongList = {
        ...target.songList,
        sortOrder: previousSongLists.length,
      };
      const nextSongLists = withSequentialSongListSortOrder([
        ...previousSongLists.filter((entry) => entry.id !== restoredSongList.id),
        restoredSongList,
      ]);

      setBandSongListsByBandId((prev) => ({
        ...prev,
        [bandId]: nextSongLists,
      }));

      try {
        const { id, accessRole: _accessRole, ...restoredPayload } = restoredSongList;
        void _accessRole;
        const payload = Object.fromEntries(
          Object.entries(restoredPayload).filter(([, value]) => value !== undefined)
        );

        await Promise.all([
          setDoc(doc(firestore, BANDS_COLLECTION, bandId, BAND_SONGLISTS_COLLECTION, id), payload),
          ...nextSongLists
            .filter((entry) => entry.id !== id)
            .map((entry) => setDoc(
              doc(firestore, BANDS_COLLECTION, bandId, BAND_SONGLISTS_COLLECTION, entry.id),
              { sortOrder: entry.sortOrder ?? 0 },
              { merge: true }
            )),
          deleteDoc(doc(firestore, BANDS_COLLECTION, bandId, TRASH_COLLECTION, trashId)),
        ]);

        return null;
      } catch (error) {
        setBandSongListsByBandId((prev) => ({
          ...prev,
          [bandId]: previousSongLists,
        }));
        setBandTrashByBandId((prev) => ({
          ...prev,
          [bandId]: [target, ...(prev[bandId] ?? [])].sort(compareTrashByDeletedAtDesc),
        }));
        return error instanceof Error ? error.message : 'Failed to restore band songlist.';
      }
    }

    if (target.itemType === 'technicalRider') {
      const previousRiders = bandInputListsByBandId[bandId] ?? [];
      const restoredRider: InputList = {
        ...target.inputList,
        sortOrder: previousRiders.length,
        updatedAt: new Date().toISOString(),
      };
      const nextRiders = withSequentialInputListSortOrder(sortInputLists([
        ...previousRiders.filter((entry) => entry.id !== restoredRider.id),
        restoredRider,
      ]));

      setBandInputListsByBandId((prev) => ({
        ...prev,
        [bandId]: nextRiders,
      }));

      try {
        const { id, accessRole: _accessRole, ...restoredPayload } = restoredRider;
        void _accessRole;
        const payload = Object.fromEntries(
          Object.entries(restoredPayload).filter(([, value]) => value !== undefined)
        );

        await Promise.all([
          setDoc(doc(firestore, BANDS_COLLECTION, bandId, BAND_INPUT_LISTS_COLLECTION, id), payload),
          ...nextRiders
            .filter((entry) => entry.id !== id)
            .map((entry) => setDoc(
              doc(firestore, BANDS_COLLECTION, bandId, BAND_INPUT_LISTS_COLLECTION, entry.id),
              { sortOrder: entry.sortOrder ?? 0 },
              { merge: true }
            )),
          deleteDoc(doc(firestore, BANDS_COLLECTION, bandId, TRASH_COLLECTION, trashId)),
        ]);

        return null;
      } catch (error) {
        setBandInputListsByBandId((prev) => ({
          ...prev,
          [bandId]: previousRiders,
        }));
        setBandTrashByBandId((prev) => ({
          ...prev,
          [bandId]: [target, ...(prev[bandId] ?? [])].sort(compareTrashByDeletedAtDesc),
        }));
        return error instanceof Error ? error.message : 'Failed to restore band input list.';
      }
    }

    const previousSetlists = bandSetlistsByBandId[bandId] ?? [];
    const restoredSetlist: Setlist = {
      ...target.setlist,
      sortOrder: previousSetlists.length,
      updatedAt: new Date().toISOString(),
    };
    const nextSetlists = withSequentialSetlistSortOrder([
      ...previousSetlists.filter((entry) => entry.id !== restoredSetlist.id),
      restoredSetlist,
    ]);

    setBandSetlistsByBandId((prev) => ({
      ...prev,
      [bandId]: nextSetlists,
    }));

    try {
      const { id, accessRole: _accessRole, ...restoredPayload } = restoredSetlist;
      void _accessRole;
      const payload = Object.fromEntries(
        Object.entries(restoredPayload).filter(([, value]) => value !== undefined)
      );

      await Promise.all([
        setDoc(doc(firestore, BANDS_COLLECTION, bandId, BAND_SETLISTS_COLLECTION, id), payload),
        ...nextSetlists
          .filter((entry) => entry.id !== id)
          .map((entry) => setDoc(
            doc(firestore, BANDS_COLLECTION, bandId, BAND_SETLISTS_COLLECTION, entry.id),
            { sortOrder: entry.sortOrder ?? 0 },
            { merge: true }
          )),
        deleteDoc(doc(firestore, BANDS_COLLECTION, bandId, TRASH_COLLECTION, trashId)),
      ]);

      return null;
    } catch (error) {
      setBandSetlistsByBandId((prev) => ({
        ...prev,
        [bandId]: previousSetlists,
      }));
      setBandTrashByBandId((prev) => ({
        ...prev,
        [bandId]: [target, ...(prev[bandId] ?? [])].sort(compareTrashByDeletedAtDesc),
      }));
      return error instanceof Error ? error.message : 'Failed to restore band setlist.';
    }
  }, [bandSetlistsByBandId, bandSongListsByBandId, bandSongsByBandId, bandInputListsByBandId, bandTrashByBandId, bands, userId]);

  const deleteBandTrashItemPermanently = useCallback(async (bandId: string, trashId: string): Promise<string | null> => {
    if (!db || !userId) {
      return 'Band libraries require cloud sync.';
    }

    const firestore = db;

    const band = bands.find((entry) => entry.id === bandId);
    if (!band) return 'Band not found.';

    const isMember = band.memberIds.includes(userId);
    if (!isMember) {
      return 'You do not have permission to edit this band.';
    }

    const previousItems = bandTrashByBandId[bandId] ?? [];
    setBandTrashByBandId((prev) => ({
      ...prev,
      [bandId]: (prev[bandId] ?? []).filter((entry) => entry.trashId !== trashId),
    }));

    try {
      await deleteDoc(doc(firestore, BANDS_COLLECTION, bandId, TRASH_COLLECTION, trashId));
      return null;
    } catch (error) {
      setBandTrashByBandId((prev) => ({
        ...prev,
        [bandId]: previousItems,
      }));
      return error instanceof Error ? error.message : 'Failed to permanently delete trash item.';
    }
  }, [bandTrashByBandId, bands, userId]);

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
    inviteMember,
    updateBandDescription,
    changeMemberRole,
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
    updateBandLibraryIcon,
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
    changeMemberRole,
    refreshBands,
    createBand,
    deleteBandSetlist,
    deleteBandInputList,
    deleteBandSongList,
    deleteBandTrashItemPermanently,
    deleteBand,
    inviteMember,
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
    updateBandLibraryIcon,
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