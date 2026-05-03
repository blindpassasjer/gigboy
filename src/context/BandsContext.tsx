/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { collection, deleteDoc, doc, getDocs, onSnapshot, query, setDoc, where } from 'firebase/firestore';
import type {
  Band,
  CollaborationPermission,
  SongHandNoteDocument,
  PublicSongEntry,
  Setlist,
  Song,
  SongList,
  Stageplot,
  StageplotItem,
  TechnicalRider,
  TrashedStageplot,
  TrashedSetlist,
  TrashedSong,
  TrashedSongList,
  TrashedTechnicalRider,
} from '../types';
import { db, firebaseEnabled } from '../lib/firebase';
import {
  changeBandMemberRoleOnServer,
  createBandOnServer,
  deleteBandOnServer,
  inviteBandMemberOnServer,
  removeBandMemberOnServer,
} from '../lib/bandsApi';
import {
  compareTrashByDeletedAtDesc,
  createTrashTimestamps,
  isTrashExpired,
  parseStageplotTrashRecord,
  parseSetlistTrashRecord,
  parseSongListTrashRecord,
  parseSongTrashRecord,
  parseTechnicalRiderTrashRecord,
  TRASH_COLLECTION,
} from '../lib/trash';
import {
  normalizeTechnicalRider,
  sortTechnicalRiders,
  withSequentialRiderEquipmentSortOrder,
  withSequentialRiderLineSortOrder,
  withSequentialTechnicalRiderSortOrder,
} from '../lib/technicalRiders';
import { useAuth } from './AuthContext';

const BANDS_COLLECTION = 'bands';
const BAND_SONGS_COLLECTION = 'songs';
const BAND_SONGLISTS_COLLECTION = 'songLists';
const BAND_SETLISTS_COLLECTION = 'setlists';
const BAND_STAGEPLOTS_COLLECTION = 'stageplots';
const BAND_TECHNICAL_RIDERS_COLLECTION = 'technicalRiders';

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

function normalizeStageplotItem(raw: unknown): StageplotItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  if (typeof data.id !== 'string') return null;

  return {
    id: data.id,
    kind: typeof data.kind === 'string' ? data.kind : 'custom',
    label: typeof data.label === 'string' ? data.label : 'Item',
    x: typeof data.x === 'number' && Number.isFinite(data.x) ? data.x : 0.5,
    y: typeof data.y === 'number' && Number.isFinite(data.y) ? data.y : 0.5,
    color: typeof data.color === 'string' ? data.color : undefined,
  };
}

function normalizeStageplotLayer(raw: unknown): SongHandNoteDocument | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  if (typeof data.authorUid !== 'string') return null;

  const viewportRaw = data.viewport && typeof data.viewport === 'object'
    ? (data.viewport as Record<string, unknown>)
    : {};

  const viewport = {
    width: typeof viewportRaw.width === 'number' && viewportRaw.width > 0 ? viewportRaw.width : 1,
    height: typeof viewportRaw.height === 'number' && viewportRaw.height > 0 ? viewportRaw.height : 1,
  };

  const strokes = Array.isArray(data.strokes)
    ? data.strokes.filter((stroke): stroke is SongHandNoteDocument['strokes'][number] => (
      Boolean(stroke)
      && typeof stroke === 'object'
      && typeof (stroke as Record<string, unknown>).id === 'string'
      && typeof (stroke as Record<string, unknown>).color === 'string'
      && typeof (stroke as Record<string, unknown>).width === 'number'
      && Array.isArray((stroke as Record<string, unknown>).points)
      && typeof (stroke as Record<string, unknown>).createdAt === 'string'
    ))
    : [];

  return {
    authorUid: data.authorUid,
    authorName: typeof data.authorName === 'string' ? data.authorName : null,
    authorAvatar: typeof data.authorAvatar === 'string' ? data.authorAvatar : null,
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : new Date().toISOString(),
    viewport,
    strokes,
  };
}

function normalizeBandStageplot(id: string, data: Record<string, unknown>): Stageplot {
  return {
    id,
    name: typeof data.name === 'string' ? data.name : 'Untitled stageplot',
    icon: typeof data.icon === 'string' ? data.icon : undefined,
    items: Array.isArray(data.items)
      ? data.items.map(normalizeStageplotItem).filter((entry): entry is StageplotItem => Boolean(entry))
      : [],
    drawingLayers: Array.isArray(data.drawingLayers)
      ? data.drawingLayers.map(normalizeStageplotLayer).filter((entry): entry is SongHandNoteDocument => Boolean(entry))
      : [],
    publicShareEnabled: data.publicShareEnabled === true ? true : undefined,
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

function sortBandStageplots(stageplots: Stageplot[]) {
  return [...stageplots].sort((a, b) => {
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

function withSequentialStageplotSortOrder(stageplots: Stageplot[]) {
  return stageplots.map((stageplot, index) => ({ ...stageplot, sortOrder: index }));
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

type BandTrashItem =
  | (TrashedSong & { bandId: string })
  | (TrashedSongList & { bandId: string })
  | (TrashedSetlist & { bandId: string })
  | (TrashedStageplot & { bandId: string })
  | (TrashedTechnicalRider & { bandId: string });

interface BandsContextValue {
  bands: Band[];
  bandSongsByBandId: Record<string, Song[]>;
  bandSongListsByBandId: Record<string, SongList[]>;
  bandSetlistsByBandId: Record<string, Setlist[]>;
  bandStageplotsByBandId: Record<string, Stageplot[]>;
  bandTechnicalRidersByBandId: Record<string, TechnicalRider[]>;
  bandTrashByBandId: Record<string, BandTrashItem[]>;
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
  refreshBandStageplots: (bandId: string) => Promise<void>;
  refreshBandTechnicalRiders: (bandId: string) => Promise<void>;
  refreshBandTrash: (bandId: string) => Promise<void>;
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
  setBandSetlistPublicShare: (bandId: string, setlistId: string, enabled: boolean) => Promise<string | null>;
  deleteBandSetlist: (bandId: string, setlistId: string) => Promise<string | null>;
  addSongToBandSetlist: (bandId: string, setlistId: string, songId: string) => Promise<string | null>;
  removeSongFromBandSetlist: (bandId: string, setlistId: string, songId: string) => Promise<string | null>;
  moveSongInBandSetlist: (bandId: string, setlistId: string, songId: string, beforeSongId: string | null) => Promise<string | null>;
  addBandStageplot: (bandId: string, name: string) => Promise<{ stageplotId: string | null; error: string | null }>;
  renameBandStageplot: (bandId: string, stageplotId: string, name: string) => Promise<string | null>;
  updateBandStageplotIcon: (bandId: string, stageplotId: string, icon?: string) => Promise<string | null>;
  setBandStageplotPublicShare: (bandId: string, stageplotId: string, enabled: boolean) => Promise<string | null>;
  updateBandStageplotContent: (params: {
    bandId: string;
    stageplotId: string;
    items: StageplotItem[];
    drawingLayers: SongHandNoteDocument[];
  }) => Promise<string | null>;
  deleteBandStageplot: (bandId: string, stageplotId: string) => Promise<string | null>;
  addBandTechnicalRider: (bandId: string, name: string) => Promise<{ riderId: string | null; error: string | null }>;
  renameBandTechnicalRider: (bandId: string, riderId: string, name: string) => Promise<string | null>;
  setBandTechnicalRiderPublicShare: (bandId: string, riderId: string, enabled: boolean) => Promise<string | null>;
  updateBandTechnicalRiderContent: (params: {
    bandId: string;
    riderId: string;
    lines: TechnicalRider['lines'];
    preferredEquipment: TechnicalRider['preferredEquipment'];
    inventoryEquipment: TechnicalRider['inventoryEquipment'];
  }) => Promise<string | null>;
  deleteBandTechnicalRider: (bandId: string, riderId: string) => Promise<string | null>;
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
  const [bandStageplotsByBandId, setBandStageplotsByBandId] = useState<Record<string, Stageplot[]>>({});
  const [bandTechnicalRidersByBandId, setBandTechnicalRidersByBandId] = useState<Record<string, TechnicalRider[]>>({});
  const [bandTrashByBandId, setBandTrashByBandId] = useState<Record<string, BandTrashItem[]>>({});
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
      setBandStageplotsByBandId({});
      setBandTechnicalRidersByBandId({});
      setBandTrashByBandId({});
      setLoading(false);
      return;
    }

    setLoading(true);

    const bandsQuery = query(collection(db, BANDS_COLLECTION), where('memberIds', 'array-contains', userId));
    const unsubscribe = onSnapshot(
      bandsQuery,
      (snapshot) => {
        const nextBands = snapshot.docs
          .map((entry) => normalizeBand(entry.id, entry.data() as Record<string, unknown>))
          .sort(compareBands);
        setBands(nextBands);
        setLoading(false);
      },
      (error) => {
        console.error('Failed to subscribe to bands from Firestore.', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
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

  const refreshBandStageplots = useCallback(async (bandId: string) => {
    if (!db || !userId) return;

    const snapshot = await getDocs(collection(db, BANDS_COLLECTION, bandId, BAND_STAGEPLOTS_COLLECTION));
    const stageplots = sortBandStageplots(
      snapshot.docs.map((entry) => normalizeBandStageplot(entry.id, entry.data() as Record<string, unknown>))
    );

    setBandStageplotsByBandId((prev) => ({
      ...prev,
      [bandId]: stageplots,
    }));
  }, [userId]);

  const refreshBandTechnicalRiders = useCallback(async (bandId: string) => {
    if (!db || !userId) return;

    const snapshot = await getDocs(collection(db, BANDS_COLLECTION, bandId, BAND_TECHNICAL_RIDERS_COLLECTION));
    const riders = sortTechnicalRiders(
      snapshot.docs.map((entry) => normalizeTechnicalRider(entry.id, entry.data() as Record<string, unknown>))
    );

    setBandTechnicalRidersByBandId((prev) => ({
      ...prev,
      [bandId]: riders,
    }));
  }, [userId]);

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
    const parsedStageplots = snapshot.docs
      .map((entry) => parseStageplotTrashRecord(entry.id, entry.data() as Record<string, unknown>))
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
    const parsedTechnicalRiders = snapshot.docs
      .map((entry) => parseTechnicalRiderTrashRecord(entry.id, entry.data() as Record<string, unknown>))
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
      ...parsedStageplots.map((entry) => ({
        bandId,
        trashId: entry.id,
        itemType: 'stageplot' as const,
        deletedAt: entry.deletedAt,
        purgeAt: entry.purgeAt,
        stageplot: entry.data,
      })),
      ...parsedTechnicalRiders.map((entry) => ({
        bandId,
        trashId: entry.id,
        itemType: 'technicalRider' as const,
        deletedAt: entry.deletedAt,
        purgeAt: entry.purgeAt,
        technicalRider: entry.data,
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
      setBandStageplotsByBandId((prev) => {
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
        const stageplotsSnapshot = await getDocs(collection(db, BANDS_COLLECTION, bandId, BAND_STAGEPLOTS_COLLECTION));
        await Promise.all(songsSnapshot.docs.map((entry) => deleteDoc(entry.ref)));
        await Promise.all(songListsSnapshot.docs.map((entry) => deleteDoc(entry.ref)));
        await Promise.all(setlistsSnapshot.docs.map((entry) => deleteDoc(entry.ref)));
        await Promise.all(stageplotsSnapshot.docs.map((entry) => deleteDoc(entry.ref)));
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
        setBandStageplotsByBandId((prev) => {
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

    const isMember = band.memberIds.includes(userId);
    if (!isMember) {
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

    const isMember = band.memberIds.includes(userId);
    if (!isMember) {
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
        setDoc(doc(firestore, BANDS_COLLECTION, bandId, TRASH_COLLECTION, trashId), {
          itemType: 'song',
          deletedAt,
          purgeAt,
          data: songToDelete,
        }),
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

    const isMember = band.memberIds.includes(userId);
    if (!isMember) {
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
        setDoc(doc(firestore, BANDS_COLLECTION, bandId, TRASH_COLLECTION, trashId), {
          itemType: 'songlist',
          deletedAt,
          purgeAt,
          data: songListToDelete,
        }),
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
        ? { ...setlist, publicShareEnabled: enabled || undefined, publicSongs, bandName: enabled ? band.name : undefined, updatedAt: now }
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

    const isMember = band.memberIds.includes(userId);
    if (!isMember) {
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
        setDoc(doc(firestore, BANDS_COLLECTION, bandId, TRASH_COLLECTION, trashId), {
          itemType: 'setlist',
          deletedAt,
          purgeAt,
          data: setlistToDelete,
        }),
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

    const previousSetlists = bandSetlistsByBandId[bandId] ?? [];
    const targetSetlist = previousSetlists.find((setlist) => setlist.id === setlistId);
    if (!targetSetlist || targetSetlist.songIds.includes(songId)) return null;

    const now = new Date().toISOString();
    const nextSongIds = [...targetSetlist.songIds, songId];
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
        songIds: nextSetlist.songIds,
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
        songIds: nextSetlist.songIds,
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

    const nextSongIds = moveSongId(targetSetlist.songIds, songId, beforeSongId);
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

  const addBandStageplot = useCallback(async (bandId: string, name: string) => {
    if (!db || !userId) {
      return { stageplotId: null, error: 'Band stageplots require cloud sync.' };
    }

    const band = bands.find((entry) => entry.id === bandId);
    if (!band) {
      return { stageplotId: null, error: 'Band not found.' };
    }

    const isMember = band.memberIds.includes(userId);
    if (!isMember) {
      return { stageplotId: null, error: 'You do not have permission to edit this band.' };
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      return { stageplotId: null, error: 'Stageplot name is required.' };
    }

    const stageplotId = crypto.randomUUID();
    const now = new Date().toISOString();
    const currentStageplots = bandStageplotsByBandId[bandId] ?? [];
    const nextStageplot: Stageplot = {
      id: stageplotId,
      name: trimmedName,
      items: [],
      drawingLayers: [],
      sortOrder: currentStageplots.length,
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
      const { id, accessRole, ...payload } = nextStageplot;
      await setDoc(doc(db, BANDS_COLLECTION, bandId, BAND_STAGEPLOTS_COLLECTION, stageplotId), payload);
      await refreshBandStageplots(bandId);
      return { stageplotId, error: null };
    } catch (error) {
      return {
        stageplotId: null,
        error: error instanceof Error ? error.message : 'Failed to create band stageplot.',
      };
    }
  }, [bandStageplotsByBandId, bands, refreshBandStageplots, userId]);

  const renameBandStageplot = useCallback(async (bandId: string, stageplotId: string, name: string) => {
    if (!db || !userId) {
      return 'Band stageplots require cloud sync.';
    }

    const band = bands.find((entry) => entry.id === bandId);
    if (!band) return 'Band not found.';

    const isMember = band.memberIds.includes(userId);
    if (!isMember) return 'You do not have permission to edit this band.';

    const trimmedName = name.trim();
    if (!trimmedName) return 'Stageplot name is required.';

    const previousStageplots = bandStageplotsByBandId[bandId] ?? [];
    const now = new Date().toISOString();
    const nextStageplots = previousStageplots.map((stageplot) => (
      stageplot.id === stageplotId ? { ...stageplot, name: trimmedName, updatedAt: now } : stageplot
    ));

    setBandStageplotsByBandId((prev) => ({
      ...prev,
      [bandId]: nextStageplots,
    }));

    try {
      await setDoc(doc(db, BANDS_COLLECTION, bandId, BAND_STAGEPLOTS_COLLECTION, stageplotId), {
        name: trimmedName,
        updatedAt: now,
      }, { merge: true });
      return null;
    } catch (error) {
      setBandStageplotsByBandId((prev) => ({
        ...prev,
        [bandId]: previousStageplots,
      }));
      return error instanceof Error ? error.message : 'Failed to rename band stageplot.';
    }
  }, [bandStageplotsByBandId, bands, userId]);

  const updateBandStageplotIcon = useCallback(async (bandId: string, stageplotId: string, icon?: string) => {
    if (!db || !userId) {
      return 'Band stageplots require cloud sync.';
    }

    const band = bands.find((entry) => entry.id === bandId);
    if (!band) return 'Band not found.';

    const isMember = band.memberIds.includes(userId);
    if (!isMember) return 'You do not have permission to edit this band.';

    const previousStageplots = bandStageplotsByBandId[bandId] ?? [];
    const now = new Date().toISOString();
    const nextStageplots = previousStageplots.map((stageplot) => (
      stageplot.id === stageplotId ? { ...stageplot, icon, updatedAt: now } : stageplot
    ));

    setBandStageplotsByBandId((prev) => ({
      ...prev,
      [bandId]: nextStageplots,
    }));

    try {
      await setDoc(doc(db, BANDS_COLLECTION, bandId, BAND_STAGEPLOTS_COLLECTION, stageplotId), {
        icon,
        updatedAt: now,
      }, { merge: true });
      return null;
    } catch (error) {
      setBandStageplotsByBandId((prev) => ({
        ...prev,
        [bandId]: previousStageplots,
      }));
      return error instanceof Error ? error.message : 'Failed to update band stageplot icon.';
    }
  }, [bandStageplotsByBandId, bands, userId]);

  const setBandStageplotPublicShare = useCallback(async (bandId: string, stageplotId: string, enabled: boolean) => {
    if (!db || !userId) {
      return 'Band stageplots require cloud sync.';
    }

    const band = bands.find((entry) => entry.id === bandId);
    if (!band) return 'Band not found.';

    const isMember = band.memberIds.includes(userId);
    if (!isMember) return 'You do not have permission to edit this band.';

    const previousStageplots = bandStageplotsByBandId[bandId] ?? [];
    const targetStageplot = previousStageplots.find((stageplot) => stageplot.id === stageplotId);
    if (!targetStageplot) return 'Stageplot not found.';

    const now = new Date().toISOString();
    const nextStageplots = previousStageplots.map((stageplot) => (
      stageplot.id === stageplotId
        ? { ...stageplot, publicShareEnabled: enabled || undefined, bandName: enabled ? band.name : undefined, updatedAt: now }
        : stageplot
    ));

    setBandStageplotsByBandId((prev) => ({
      ...prev,
      [bandId]: nextStageplots,
    }));

    try {
      await setDoc(doc(db, BANDS_COLLECTION, bandId, BAND_STAGEPLOTS_COLLECTION, stageplotId), {
        publicShareEnabled: enabled || null,
        bandName: enabled ? band.name : null,
        updatedAt: now,
      }, { merge: true });
      return null;
    } catch (error) {
      setBandStageplotsByBandId((prev) => ({
        ...prev,
        [bandId]: previousStageplots,
      }));
      return error instanceof Error ? error.message : 'Failed to update stageplot sharing.';
    }
  }, [bandStageplotsByBandId, bands, userId]);

  const updateBandStageplotContent = useCallback(async (params: {
    bandId: string;
    stageplotId: string;
    items: StageplotItem[];
    drawingLayers: SongHandNoteDocument[];
  }) => {
    const {
      bandId,
      stageplotId,
      items,
      drawingLayers,
    } = params;

    if (!db || !userId) {
      return 'Band stageplots require cloud sync.';
    }

    const band = bands.find((entry) => entry.id === bandId);
    if (!band) return 'Band not found.';

    const isMember = band.memberIds.includes(userId);
    if (!isMember) return 'You do not have permission to edit this band.';

    const previousStageplots = bandStageplotsByBandId[bandId] ?? [];
    const targetStageplot = previousStageplots.find((stageplot) => stageplot.id === stageplotId);
    if (!targetStageplot) return 'Stageplot not found.';

    const now = new Date().toISOString();
    const nextStageplot: Stageplot = {
      ...targetStageplot,
      items,
      drawingLayers,
      updatedAt: now,
    };

    const nextStageplots = previousStageplots.map((stageplot) => (
      stageplot.id === stageplotId ? nextStageplot : stageplot
    ));

    setBandStageplotsByBandId((prev) => ({
      ...prev,
      [bandId]: nextStageplots,
    }));

    try {
      await setDoc(doc(db, BANDS_COLLECTION, bandId, BAND_STAGEPLOTS_COLLECTION, stageplotId), {
        items,
        drawingLayers,
        updatedAt: now,
      }, { merge: true });
      return null;
    } catch (error) {
      setBandStageplotsByBandId((prev) => ({
        ...prev,
        [bandId]: previousStageplots,
      }));
      return error instanceof Error ? error.message : 'Failed to update stageplot.';
    }
  }, [bandStageplotsByBandId, bands, userId]);

  const deleteBandStageplot = useCallback(async (bandId: string, stageplotId: string) => {
    if (!db || !userId) {
      return 'Band stageplots require cloud sync.';
    }

    const firestore = db;

    const band = bands.find((entry) => entry.id === bandId);
    if (!band) return 'Band not found.';

    const isMember = band.memberIds.includes(userId);
    if (!isMember) {
      return 'You do not have permission to edit this band.';
    }

    const previousStageplots = bandStageplotsByBandId[bandId] ?? [];
    const stageplotToDelete = previousStageplots.find((stageplot) => stageplot.id === stageplotId);
    if (!stageplotToDelete) {
      return null;
    }

    const { deletedAt, purgeAt } = createTrashTimestamps();
    const trashId = crypto.randomUUID();
    const nextStageplots = withSequentialStageplotSortOrder(
      previousStageplots.filter((stageplot) => stageplot.id !== stageplotId)
    );

    setBandStageplotsByBandId((prev) => ({
      ...prev,
      [bandId]: nextStageplots,
    }));
    setBandTrashByBandId((prev) => ({
      ...prev,
      [bandId]: [
        {
          bandId,
          trashId,
          itemType: 'stageplot' as const,
          deletedAt,
          purgeAt,
          stageplot: stageplotToDelete,
        },
        ...(prev[bandId] ?? []),
      ].sort(compareTrashByDeletedAtDesc),
    }));

    try {
      await Promise.all([
        setDoc(doc(firestore, BANDS_COLLECTION, bandId, TRASH_COLLECTION, trashId), {
          itemType: 'stageplot',
          deletedAt,
          purgeAt,
          data: stageplotToDelete,
        }),
        deleteDoc(doc(firestore, BANDS_COLLECTION, bandId, BAND_STAGEPLOTS_COLLECTION, stageplotId)),
        ...nextStageplots.map((stageplot) => setDoc(
          doc(firestore, BANDS_COLLECTION, bandId, BAND_STAGEPLOTS_COLLECTION, stageplot.id),
          { sortOrder: stageplot.sortOrder ?? 0 },
          { merge: true }
        )),
      ]);
      return null;
    } catch (error) {
      setBandStageplotsByBandId((prev) => ({
        ...prev,
        [bandId]: previousStageplots,
      }));
      setBandTrashByBandId((prev) => ({
        ...prev,
        [bandId]: (prev[bandId] ?? []).filter((entry) => entry.trashId !== trashId),
      }));
      return error instanceof Error ? error.message : 'Failed to delete band stageplot.';
    }
  }, [bandStageplotsByBandId, bands, userId]);

  const addBandTechnicalRider = useCallback(async (bandId: string, name: string) => {
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
    const previousRiders = bandTechnicalRidersByBandId[bandId] ?? [];
    const nextRider: TechnicalRider = {
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

    const nextRiders = withSequentialTechnicalRiderSortOrder(sortTechnicalRiders([...previousRiders, nextRider]));

    setBandTechnicalRidersByBandId((prev) => ({
      ...prev,
      [bandId]: nextRiders,
    }));

    try {
      await Promise.all(nextRiders.map((rider) => setDoc(
        doc(firestore, BANDS_COLLECTION, bandId, BAND_TECHNICAL_RIDERS_COLLECTION, rider.id),
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
      setBandTechnicalRidersByBandId((prev) => ({
        ...prev,
        [bandId]: previousRiders,
      }));
      return { riderId: null, error: error instanceof Error ? error.message : 'Failed to create technical rider.' };
    }
  }, [bandTechnicalRidersByBandId, bands, userId]);

  const renameBandTechnicalRider = useCallback(async (bandId: string, riderId: string, name: string) => {
    if (!db || !userId) {
      return 'Band riders require cloud sync.';
    }

    const band = bands.find((entry) => entry.id === bandId);
    if (!band) return 'Band not found.';

    const isMember = band.memberIds.includes(userId);
    if (!isMember) return 'You do not have permission to edit this band.';

    const trimmed = name.trim();
    if (!trimmed) return 'Rider name is required.';

    const previousRiders = bandTechnicalRidersByBandId[bandId] ?? [];
    const now = new Date().toISOString();
    const nextRiders = previousRiders.map((rider) => (
      rider.id === riderId ? { ...rider, name: trimmed, updatedAt: now } : rider
    ));

    setBandTechnicalRidersByBandId((prev) => ({
      ...prev,
      [bandId]: nextRiders,
    }));

    try {
      await setDoc(doc(db, BANDS_COLLECTION, bandId, BAND_TECHNICAL_RIDERS_COLLECTION, riderId), {
        name: trimmed,
        updatedAt: now,
      }, { merge: true });
      return null;
    } catch (error) {
      setBandTechnicalRidersByBandId((prev) => ({
        ...prev,
        [bandId]: previousRiders,
      }));
      return error instanceof Error ? error.message : 'Failed to rename technical rider.';
    }
  }, [bandTechnicalRidersByBandId, bands, userId]);

  const setBandTechnicalRiderPublicShare = useCallback(async (bandId: string, riderId: string, enabled: boolean) => {
    if (!db || !userId) {
      return 'Band riders require cloud sync.';
    }

    const band = bands.find((entry) => entry.id === bandId);
    if (!band) return 'Band not found.';

    const isMember = band.memberIds.includes(userId);
    if (!isMember) return 'You do not have permission to edit this band.';

    const previousRiders = bandTechnicalRidersByBandId[bandId] ?? [];
    const now = new Date().toISOString();
    const nextRiders = previousRiders.map((rider) => (
      rider.id === riderId
        ? { ...rider, publicShareEnabled: enabled || undefined, bandName: enabled ? band.name : undefined, updatedAt: now }
        : rider
    ));

    setBandTechnicalRidersByBandId((prev) => ({
      ...prev,
      [bandId]: nextRiders,
    }));

    try {
      await setDoc(doc(db, BANDS_COLLECTION, bandId, BAND_TECHNICAL_RIDERS_COLLECTION, riderId), {
        publicShareEnabled: enabled || null,
        bandName: enabled ? band.name : null,
        updatedAt: now,
      }, { merge: true });
      return null;
    } catch (error) {
      setBandTechnicalRidersByBandId((prev) => ({
        ...prev,
        [bandId]: previousRiders,
      }));
      return error instanceof Error ? error.message : 'Failed to update technical rider sharing.';
    }
  }, [bandTechnicalRidersByBandId, bands, userId]);

  const updateBandTechnicalRiderContent = useCallback(async (params: {
    bandId: string;
    riderId: string;
    lines: TechnicalRider['lines'];
    preferredEquipment: TechnicalRider['preferredEquipment'];
    inventoryEquipment: TechnicalRider['inventoryEquipment'];
  }) => {
    const { bandId, riderId, lines, preferredEquipment, inventoryEquipment } = params;

    if (!db || !userId) {
      return 'Band riders require cloud sync.';
    }

    const band = bands.find((entry) => entry.id === bandId);
    if (!band) return 'Band not found.';

    const isMember = band.memberIds.includes(userId);
    if (!isMember) return 'You do not have permission to edit this band.';

    const previousRiders = bandTechnicalRidersByBandId[bandId] ?? [];
    const target = previousRiders.find((rider) => rider.id === riderId);
    if (!target) return 'Technical rider not found.';

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

    setBandTechnicalRidersByBandId((prev) => ({
      ...prev,
      [bandId]: nextRiders,
    }));

    try {
      await setDoc(doc(db, BANDS_COLLECTION, bandId, BAND_TECHNICAL_RIDERS_COLLECTION, riderId), {
        lines: next?.lines ?? [],
        preferredEquipment: next?.preferredEquipment ?? [],
        inventoryEquipment: next?.inventoryEquipment ?? [],
        updatedAt: now,
      }, { merge: true });
      return null;
    } catch (error) {
      setBandTechnicalRidersByBandId((prev) => ({
        ...prev,
        [bandId]: previousRiders,
      }));
      return error instanceof Error ? error.message : 'Failed to update technical rider.';
    }
  }, [bandTechnicalRidersByBandId, bands, userId]);

  const deleteBandTechnicalRider = useCallback(async (bandId: string, riderId: string) => {
    if (!db || !userId) {
      return 'Band riders require cloud sync.';
    }

    const firestore = db;

    const band = bands.find((entry) => entry.id === bandId);
    if (!band) return 'Band not found.';

    const isMember = band.memberIds.includes(userId);
    if (!isMember) return 'You do not have permission to edit this band.';

    const previousRiders = bandTechnicalRidersByBandId[bandId] ?? [];
    const riderToDelete = previousRiders.find((rider) => rider.id === riderId);
    if (!riderToDelete) {
      return null;
    }

    const { deletedAt, purgeAt } = createTrashTimestamps();
    const trashId = crypto.randomUUID();
    const nextRiders = withSequentialTechnicalRiderSortOrder(sortTechnicalRiders(
      previousRiders.filter((rider) => rider.id !== riderId)
    ));

    setBandTechnicalRidersByBandId((prev) => ({
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
          technicalRider: riderToDelete,
        },
        ...(prev[bandId] ?? []),
      ].sort(compareTrashByDeletedAtDesc),
    }));

    try {
      await Promise.all([
        setDoc(doc(firestore, BANDS_COLLECTION, bandId, TRASH_COLLECTION, trashId), {
          itemType: 'technicalRider',
          deletedAt,
          purgeAt,
          data: riderToDelete,
        }),
        deleteDoc(doc(firestore, BANDS_COLLECTION, bandId, BAND_TECHNICAL_RIDERS_COLLECTION, riderId)),
        ...nextRiders.map((rider) => setDoc(
          doc(firestore, BANDS_COLLECTION, bandId, BAND_TECHNICAL_RIDERS_COLLECTION, rider.id),
          { sortOrder: rider.sortOrder ?? 0 },
          { merge: true }
        )),
      ]);
      return null;
    } catch (error) {
      setBandTechnicalRidersByBandId((prev) => ({
        ...prev,
        [bandId]: previousRiders,
      }));
      setBandTrashByBandId((prev) => ({
        ...prev,
        [bandId]: (prev[bandId] ?? []).filter((entry) => entry.trashId !== trashId),
      }));
      return error instanceof Error ? error.message : 'Failed to move technical rider to trash.';
    }
  }, [bandTechnicalRidersByBandId, bands, userId]);

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

    if (target.itemType === 'stageplot') {
      const previousStageplots = bandStageplotsByBandId[bandId] ?? [];
      const restoredStageplot: Stageplot = {
        ...target.stageplot,
        sortOrder: previousStageplots.length,
        updatedAt: new Date().toISOString(),
      };
      const nextStageplots = withSequentialStageplotSortOrder([
        ...previousStageplots.filter((entry) => entry.id !== restoredStageplot.id),
        restoredStageplot,
      ]);

      setBandStageplotsByBandId((prev) => ({
        ...prev,
        [bandId]: nextStageplots,
      }));

      try {
        const { id, accessRole: _accessRole, ...restoredPayload } = restoredStageplot;
        void _accessRole;
        const payload = Object.fromEntries(
          Object.entries(restoredPayload).filter(([, value]) => value !== undefined)
        );

        await Promise.all([
          setDoc(doc(firestore, BANDS_COLLECTION, bandId, BAND_STAGEPLOTS_COLLECTION, id), payload),
          ...nextStageplots
            .filter((entry) => entry.id !== id)
            .map((entry) => setDoc(
              doc(firestore, BANDS_COLLECTION, bandId, BAND_STAGEPLOTS_COLLECTION, entry.id),
              { sortOrder: entry.sortOrder ?? 0 },
              { merge: true }
            )),
          deleteDoc(doc(firestore, BANDS_COLLECTION, bandId, TRASH_COLLECTION, trashId)),
        ]);

        return null;
      } catch (error) {
        setBandStageplotsByBandId((prev) => ({
          ...prev,
          [bandId]: previousStageplots,
        }));
        setBandTrashByBandId((prev) => ({
          ...prev,
          [bandId]: [target, ...(prev[bandId] ?? [])].sort(compareTrashByDeletedAtDesc),
        }));
        return error instanceof Error ? error.message : 'Failed to restore band stageplot.';
      }
    }

    if (target.itemType === 'technicalRider') {
      const previousRiders = bandTechnicalRidersByBandId[bandId] ?? [];
      const restoredRider: TechnicalRider = {
        ...target.technicalRider,
        sortOrder: previousRiders.length,
        updatedAt: new Date().toISOString(),
      };
      const nextRiders = withSequentialTechnicalRiderSortOrder(sortTechnicalRiders([
        ...previousRiders.filter((entry) => entry.id !== restoredRider.id),
        restoredRider,
      ]));

      setBandTechnicalRidersByBandId((prev) => ({
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
          setDoc(doc(firestore, BANDS_COLLECTION, bandId, BAND_TECHNICAL_RIDERS_COLLECTION, id), payload),
          ...nextRiders
            .filter((entry) => entry.id !== id)
            .map((entry) => setDoc(
              doc(firestore, BANDS_COLLECTION, bandId, BAND_TECHNICAL_RIDERS_COLLECTION, entry.id),
              { sortOrder: entry.sortOrder ?? 0 },
              { merge: true }
            )),
          deleteDoc(doc(firestore, BANDS_COLLECTION, bandId, TRASH_COLLECTION, trashId)),
        ]);

        return null;
      } catch (error) {
        setBandTechnicalRidersByBandId((prev) => ({
          ...prev,
          [bandId]: previousRiders,
        }));
        setBandTrashByBandId((prev) => ({
          ...prev,
          [bandId]: [target, ...(prev[bandId] ?? [])].sort(compareTrashByDeletedAtDesc),
        }));
        return error instanceof Error ? error.message : 'Failed to restore band technical rider.';
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
  }, [bandSetlistsByBandId, bandSongListsByBandId, bandSongsByBandId, bandStageplotsByBandId, bandTechnicalRidersByBandId, bandTrashByBandId, bands, userId]);

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
    bandStageplotsByBandId,
    bandTechnicalRidersByBandId,
    bandTrashByBandId,
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
    refreshBandStageplots,
    refreshBandTechnicalRiders,
    refreshBandTrash,
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
    setBandSetlistPublicShare,
    deleteBandSetlist,
    addSongToBandSetlist,
    removeSongFromBandSetlist,
    moveSongInBandSetlist,
    addBandStageplot,
    renameBandStageplot,
    updateBandStageplotIcon,
    setBandStageplotPublicShare,
    updateBandStageplotContent,
    deleteBandStageplot,
    addBandTechnicalRider,
    renameBandTechnicalRider,
    setBandTechnicalRiderPublicShare,
    updateBandTechnicalRiderContent,
    deleteBandTechnicalRider,
    restoreBandTrashItem,
    deleteBandTrashItemPermanently,
  }), [
    addBandStageplot,
    addBandSetlist,
    addBandSongList,
    addBandTechnicalRider,
    bandStageplotsByBandId,
    bandTechnicalRidersByBandId,
    addSongToBandSetlist,
    addSongToBandSongList,
    addSongToBandLibrary,
    bandSetlistsByBandId,
    bandSongListsByBandId,
    bandSongsByBandId,
    bandTrashByBandId,
    bands,
    changeMemberRole,
    refreshBands,
    createBand,
    deleteBandSetlist,
    deleteBandStageplot,
    deleteBandTechnicalRider,
    deleteBandSongList,
    deleteBandTrashItemPermanently,
    deleteBand,
    inviteMember,
    leaveBand,
    loading,
    moveSongInBandSetlist,
    moveSongInBandSongList,
    moveBandSong,
    refreshBandSetlists,
    refreshBandSongLists,
    refreshBandStageplots,
    refreshBandTechnicalRiders,
    refreshBandTrash,
    renameBand,
    renameBandStageplot,
    renameBandSetlist,
    renameBandSongList,
    renameBandTechnicalRider,
    updateBandSongListIcon,
    refreshBandSongs,
    removeMember,
    removeSongFromBandSetlist,
    removeSongFromBandSongList,
    removeSongFromBandLibrary,
    restoreBandTrashItem,
    updateBandLibraryIcon,
    updateBandSetlistIcon,
    setBandStageplotPublicShare,
    setBandTechnicalRiderPublicShare,
    setBandSetlistPublicShare,
    updateBandStageplotContent,
    updateBandStageplotIcon,
    updateBandTechnicalRiderContent,
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