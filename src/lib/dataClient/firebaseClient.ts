import {
  createUserWithEmailAndPassword,
  deleteUser,
  onAuthStateChanged as onFirebaseAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User as FirebaseUser,
} from 'firebase/auth';
import type { FirebaseError } from 'firebase/app';
import { collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, query, setDoc, where } from 'firebase/firestore';
import { deleteObject, getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage';
import type { Band, CollaborationPermission, InputList, PressKit, PublicSongEntry, Setlist, Song, SongList } from '../../types';
import type { User } from '../../context/AuthContext';
import type { TrashListItem } from '../../components/TrashView';
import { auth, db, firebaseConfigError } from '../firebase';
import { claimUsername, loadUserProfile } from '../userProfiles';
import { normalizeInputList } from '../inputLists';
import {
  createBandOnServer,
  deleteBandOnServer,
  createBandInviteLinkOnServer,
  acceptBandInviteOnServer,
  removeBandMemberOnServer,
  createBandRiderOnServer,
  createBandPressKitOnServer,
} from '../bandsApi';
import {
  createPressKitShare,
  disablePressKitShare,
  fetchPublicPressKit,
  getActivePressKitShare,
} from '../pressKitApi';
import { storage } from '../firebase';
import {
  deleteSongAttachmentPermanently,
  loadSongAttachments,
  moveSongAttachmentToTrash,
  renameSongAttachment,
  restoreSongAttachmentFromTrash,
  uploadSongAttachment,
  type AttachmentsScope,
  type SongAttachment,
  type TrashedSongAttachment,
  type UploaderIdentity,
} from '../songAttachments';
import {
  compareTrashByDeletedAtDesc,
  createTrashPayload,
  createTrashTimestamps,
  isTrashExpired,
  parseAttachmentTrashRecord,
  parseBandLogoTrashRecord,
  parseInputListTrashRecord,
  parsePressKitImageTrashRecord,
  parsePressKitTrashRecord,
  parseSetlistTrashRecord,
  parseSongListTrashRecord,
  parseSongTrashRecord,
  TRASH_COLLECTION,
} from '../trash';
import type {
  AttachmentsClient,
  AuthClient,
  BandAttachmentsClient,
  BandInvite,
  BandScopedCrudClient,
  BandsClient,
  BandTrashClient,
  CrudClient,
  DataClient,
  PressKitImage,
  PressKitImagesClient,
  PressKitSharesClient,
  PublicPressKitsClient,
  PublicRider,
  PublicRidersClient,
  TrashClient,
} from './types';

/**
 * Hosted-SaaS `DataClient` implementation: extracted as-is from the Firestore logic that
 * used to live inline in `AuthContext`/`SongsContext`/`SongListsContext`/`SetlistsContext`.
 * Behaviorally identical to what those contexts did before this refactor. Only covers
 * auth + personal songs/songLists/setlists — bands, collaboration, trash, attachments,
 * etc. stay outside this interface and are still handled directly in the contexts.
 */

const SONGS_COLLECTION = 'songs';
const SONG_LISTS_COLLECTION = 'songLists';
const SETLISTS_COLLECTION = 'setlists';

function getAuthErrorCode(err: unknown): string | null {
  if (!(err instanceof Error)) {
    return null;
  }

  const typedCode = (err as FirebaseError).code;
  if (typeof typedCode === 'string' && typedCode.length > 0) {
    return typedCode;
  }

  const messageMatch = err.message.match(/\(auth\/[a-z0-9-]+\)/i);
  if (messageMatch) {
    return messageMatch[0].slice(1, -1).toLowerCase();
  }

  return null;
}

function fallbackUser(firebaseUser: FirebaseUser): User {
  return {
    id: firebaseUser.uid,
    email: firebaseUser.email ?? '',
    username: null,
    avatar: null,
    fullName: null,
    plan: 'free',
    planOverride: false,
    subscriptionStatus: null,
    currentPeriodEnd: null,
    storageQuotaBytes: 100 * 1024 * 1024,
    bandExtraMembers: 0,
    memberLimit: 1,
    stripeCustomerId: null,
  };
}

async function resolveUser(firebaseUser: FirebaseUser): Promise<User> {
  if (!db) {
    return fallbackUser(firebaseUser);
  }

  try {
    const profile = await loadUserProfile(db, firebaseUser.uid);
    return {
      id: firebaseUser.uid,
      email: firebaseUser.email ?? '',
      username: profile?.username ?? null,
      avatar: profile?.avatar ?? null,
      fullName: profile?.fullName ?? null,
      plan: profile?.plan ?? 'free',
      planOverride: profile?.planOverride === true,
      subscriptionStatus: profile?.subscriptionStatus ?? null,
      currentPeriodEnd: profile?.currentPeriodEnd ?? null,
      storageQuotaBytes: profile?.storageQuotaBytes ?? 100 * 1024 * 1024,
      bandExtraMembers: profile?.bandExtraMembers ?? 0,
      memberLimit: profile?.memberLimit ?? 1,
      stripeCustomerId: profile?.stripeCustomerId ?? null,
    };
  } catch (error) {
    console.error('Failed to load user profile.', error);
    return fallbackUser(firebaseUser);
  }
}

const authClient: AuthClient = {
  async getCurrentUser() {
    if (!auth?.currentUser) return null;
    return resolveUser(auth.currentUser);
  },

  onAuthStateChanged(callback) {
    if (!auth) {
      callback(null);
      return () => undefined;
    }
    const authInstance = auth;

    let unsubscribeProfile: (() => void) | null = null;

    const unsubscribeAuth = onFirebaseAuthStateChanged(authInstance, (firebaseUser) => {
      if (unsubscribeProfile) {
        unsubscribeProfile();
        unsubscribeProfile = null;
      }

      if (!firebaseUser) {
        callback(null);
        return;
      }

      if (!db) {
        callback(fallbackUser(firebaseUser));
        return;
      }
      const firestore = db;

      const syncProfile = async () => {
        if (authInstance.currentUser?.uid !== firebaseUser.uid) return;
        const user = await resolveUser(firebaseUser);
        if (authInstance.currentUser?.uid !== firebaseUser.uid) return;
        callback(user);
      };

      unsubscribeProfile = onSnapshot(
        doc(firestore, 'users', firebaseUser.uid),
        () => {
          void syncProfile();
        },
        (error) => {
          console.error('Failed to subscribe to user profile.', error);
          void syncProfile();
        }
      );
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeProfile) {
        unsubscribeProfile();
      }
    };
  },

  async login(email, password) {
    if (!auth) {
      return { user: null, error: firebaseConfigError ?? 'Firebase authentication is not configured.' };
    }

    try {
      const result = await signInWithEmailAndPassword(auth, email, password);
      return { user: await resolveUser(result.user), error: null };
    } catch (err: unknown) {
      const code = getAuthErrorCode(err);
      if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/invalid-login-credentials') {
        return { user: null, error: 'Invalid email or password.' };
      }
      return { user: null, error: err instanceof Error ? err.message : 'Login failed' };
    }
  },

  async register(email, password, username) {
    if (!auth || !db) {
      return { user: null, error: firebaseConfigError ?? 'Firebase authentication is not configured.' };
    }

    try {
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      try {
        await claimUsername(db, {
          userId: credential.user.uid,
          email: credential.user.email ?? email,
          username,
        });
      } catch (profileError) {
        await deleteUser(credential.user).catch(() => undefined);
        throw profileError;
      }
      const user = await resolveUser(credential.user);
      return { user: { ...user, username }, error: null };
    } catch (err: unknown) {
      return { user: null, error: err instanceof Error ? err.message : 'Registration failed' };
    }
  },

  async logout() {
    if (!auth) return;
    await signOut(auth);
  },
};

function currentUid(): string | null {
  return auth?.currentUser?.uid ?? null;
}

function stripUndefined<T extends { id: string }>(item: T): Record<string, unknown> {
  const { id: _id, ...rest } = item;
  void _id;
  return Object.fromEntries(Object.entries(rest).filter(([, value]) => value !== undefined));
}

export function songFromOwnedDoc(id: string, data: Record<string, unknown>, ownerId: string, currentUserId: string): Song {
  const playbackUrl =
    typeof data.playbackUrl === 'string' && data.playbackUrl.trim().length > 0
      ? data.playbackUrl
      : typeof data.playbackURL === 'string' && data.playbackURL.trim().length > 0
        ? data.playbackURL
        : typeof data.playback_url === 'string' && data.playback_url.trim().length > 0
          ? data.playback_url
          : typeof data.mediaUrl === 'string' && data.mediaUrl.trim().length > 0
            ? data.mediaUrl
            : typeof data.mediaURL === 'string' && data.mediaURL.trim().length > 0
              ? data.mediaURL
              : typeof data.media_url === 'string' && data.media_url.trim().length > 0
                ? data.media_url
                : undefined;

  const song: Song = {
    ...(data as Omit<Song, 'id' | 'title' | 'language' | 'chordpro'>),
    id,
    ownerId,
    title: typeof data.title === 'string' ? data.title : '',
    language: typeof data.language === 'string' ? data.language : 'en',
    chordpro: typeof data.chordpro === 'string' ? data.chordpro : '',
    playbackUrl,
  };
  const role = ownerId === currentUserId
    ? 'owner'
    : song.collaborationPermissions?.[currentUserId];
  return {
    ...song,
    accessRole: role === 'editor' || role === 'viewer' ? role : ownerId === currentUserId ? 'owner' : undefined,
  };
}

export function songListFromDoc(id: string, data: Record<string, unknown>, ownerId: string, currentUserId: string): SongList {
  const songList = { id, ownerId, ...(data as Omit<SongList, 'id'>) } as SongList;
  const role = ownerId === currentUserId
    ? 'owner'
    : songList.collaborationPermissions?.[currentUserId];
  return { ...songList, accessRole: role === 'viewer' || role === 'editor' ? role : (ownerId === currentUserId ? 'owner' : undefined) };
}

export function setlistFromDoc(id: string, data: Record<string, unknown>, ownerId: string, currentUserId: string): Setlist {
  const setlist = { id, ownerId, ...(data as Omit<Setlist, 'id'>) } as Setlist;
  const role = ownerId === currentUserId
    ? 'owner'
    : setlist.collaborationPermissions?.[currentUserId];
  return { ...setlist, accessRole: role === 'editor' || role === 'viewer' ? role : (ownerId === currentUserId ? 'owner' : undefined) };
}

function makeOwnedCollectionClient<T extends { id: string }>(
  collectionName: string,
  mapDoc: (id: string, data: Record<string, unknown>, ownerId: string, currentUserId: string) => T
): CrudClient<T> {
  return {
    async list() {
      const uid = currentUid();
      if (!db || !uid) return [];
      const snap = await getDocs(collection(db, 'users', uid, collectionName));
      return snap.docs.map((entry) => mapDoc(entry.id, entry.data() as Record<string, unknown>, uid, uid));
    },
    async create(item) {
      const uid = currentUid();
      if (!db || !uid) return item;
      await setDoc(doc(db, 'users', uid, collectionName, item.id), stripUndefined(item));
      return item;
    },
    async update(item) {
      const uid = currentUid();
      if (!db || !uid) return item;
      await setDoc(doc(db, 'users', uid, collectionName, item.id), stripUndefined(item));
      return item;
    },
    async remove(id) {
      const uid = currentUid();
      if (!db || !uid) return;
      await deleteDoc(doc(db, 'users', uid, collectionName, id));
    },
  };
}

/**
 * Band + band-scoped resources. Extracted from `BandsContext.tsx`'s Firestore logic
 * (band CRUD around createBand/deleteBand/renameBand/updateBandDescription, membership
 * around removeMember/leaveBand, and band-scoped song/songList/setlist CRUD). Business
 * logic (permission checks, plan-limit checks, trash writes, optimistic local state)
 * stays in `BandsContext.tsx` — this module only performs the Firestore reads/writes
 * (mirroring how `makeOwnedCollectionClient` above only persists, and validation stays
 * in `SongsContext`/etc.).
 */

export const BANDS_COLLECTION = 'bands';
export const BAND_SONGS_COLLECTION = 'songs';
export const BAND_SONGLISTS_COLLECTION = 'songLists';
export const BAND_SETLISTS_COLLECTION = 'setlists';
export const BAND_INPUT_LISTS_COLLECTION = 'technicalRiders';

export function readFirstNonEmptyString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
  }
  return null;
}

export function compareBands(a: Band, b: Band) {
  const updatedAtA = a.updatedAt ?? a.createdAt;
  const updatedAtB = b.updatedAt ?? b.createdAt;
  if (updatedAtA !== updatedAtB) {
    return updatedAtB.localeCompare(updatedAtA);
  }
  return a.name.localeCompare(b.name);
}

export function mergeBandsById(primary: Band[], secondary: Band[]) {
  const merged = new Map<string, Band>();
  primary.forEach((band) => merged.set(band.id, band));
  secondary.forEach((band) => {
    if (!merged.has(band.id)) {
      merged.set(band.id, band);
    }
  });
  return Array.from(merged.values()).sort(compareBands);
}

export function normalizeBand(id: string, data: Record<string, unknown>): Band {
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
    billingPlan: data.billingPlan === 'crew' ? 'crew' : data.billingPlan === 'pro' ? 'pro' : data.billingPlan === 'free' ? 'free' : undefined,
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

export function normalizeBandSong(id: string, data: Record<string, unknown>): Song {
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
    author: typeof data.author === 'string' ? data.author : undefined,
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
    preferredTranspose: typeof data.preferredTranspose === 'number' ? data.preferredTranspose : undefined,
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

export function normalizeBandSongList(id: string, data: Record<string, unknown>): SongList {
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

export function normalizeBandSetlist(id: string, data: Record<string, unknown>): Setlist {
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

function makeBandScopedClient<T extends { id: string }>(
  collectionName: string,
  mapDoc: (id: string, data: Record<string, unknown>) => T
): BandScopedCrudClient<T> {
  return {
    async list(bandId) {
      if (!db) return [];
      const snap = await getDocs(collection(db, BANDS_COLLECTION, bandId, collectionName));
      return snap.docs.map((entry) => mapDoc(entry.id, entry.data() as Record<string, unknown>));
    },
    async create(bandId, item) {
      if (!db) return item;
      await setDoc(doc(db, BANDS_COLLECTION, bandId, collectionName, item.id), stripUndefined(item));
      return item;
    },
    async update(bandId, item) {
      if (!db) return item;
      await setDoc(doc(db, BANDS_COLLECTION, bandId, collectionName, item.id), stripUndefined(item));
      return item;
    },
    async remove(bandId, id) {
      if (!db) return;
      await deleteDoc(doc(db, BANDS_COLLECTION, bandId, collectionName, id));
    },
  };
}

const bandsClient: BandsClient = {
  async list() {
    const uid = currentUid();
    if (!db || !uid) return [];
    const [memberSnapshot, ownerSnapshot] = await Promise.all([
      getDocs(query(collection(db, BANDS_COLLECTION), where('memberIds', 'array-contains', uid))),
      getDocs(query(collection(db, BANDS_COLLECTION), where('ownerId', '==', uid))),
    ]);
    const memberBands = memberSnapshot.docs
      .map((entry) => normalizeBand(entry.id, entry.data() as Record<string, unknown>))
      .sort(compareBands);
    const ownerBands = ownerSnapshot.docs
      .map((entry) => normalizeBand(entry.id, entry.data() as Record<string, unknown>))
      .sort(compareBands);
    return mergeBandsById(memberBands, ownerBands);
  },

  async create(input) {
    const uid = currentUid();
    if (!uid) throw new Error('Bands require a signed-in account.');

    const trimmedName = input.name.trim();
    const trimmedDescription = input.description?.trim();
    const userEmail = auth?.currentUser?.email ?? '';

    try {
      const response = await createBandOnServer({
        userId: uid,
        userEmail,
        name: trimmedName,
        description: trimmedDescription,
        icon: input.icon,
      });
      if (!db) throw new Error('Bands require cloud sync.');
      const snap = await getDoc(doc(db, BANDS_COLLECTION, response.bandId));
      return normalizeBand(response.bandId, (snap.data() ?? {}) as Record<string, unknown>);
    } catch (serverError) {
      if (!db) throw serverError;

      const profile = await loadUserProfile(db, uid).catch(() => null);
      const bandId = crypto.randomUUID();
      const now = new Date().toISOString();
      const data = {
        name: trimmedName,
        ...(trimmedDescription ? { description: trimmedDescription } : {}),
        ...(input.icon ? { icon: input.icon } : {}),
        ownerId: uid,
        memberIds: [uid],
        memberRoles: { [uid]: 'editor' },
        memberEmails: userEmail ? { [uid]: userEmail } : {},
        memberUsernames: profile?.username ? { [uid]: profile.username } : {},
        memberFullNames: profile?.fullName ? { [uid]: profile.fullName } : {},
        memberAvatars: profile?.avatar ? { [uid]: profile.avatar } : {},
        createdAt: now,
        updatedAt: now,
      };
      await setDoc(doc(db, BANDS_COLLECTION, bandId), data);
      return normalizeBand(bandId, data);
    }
  },

  async update(id, input) {
    if (!db) throw new Error('Bands require cloud sync.');
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = { updatedAt: now };
    if (input.name !== undefined) patch.name = input.name;
    if (input.description !== undefined) patch.description = input.description || null;
    if (input.icon !== undefined) patch.icon = input.icon || null;
    await setDoc(doc(db, BANDS_COLLECTION, id), patch, { merge: true });
    const snap = await getDoc(doc(db, BANDS_COLLECTION, id));
    return normalizeBand(id, (snap.data() ?? {}) as Record<string, unknown>);
  },

  async remove(id) {
    const uid = currentUid();
    if (!uid) throw new Error('Bands require a signed-in account.');
    const userEmail = auth?.currentUser?.email ?? '';

    try {
      await deleteBandOnServer({ userId: uid, userEmail, bandId: id });
      return;
    } catch (serverError) {
      if (!db) throw serverError;

      const [songsSnap, songListsSnap, setlistsSnap] = await Promise.all([
        getDocs(collection(db, BANDS_COLLECTION, id, BAND_SONGS_COLLECTION)),
        getDocs(collection(db, BANDS_COLLECTION, id, BAND_SONGLISTS_COLLECTION)),
        getDocs(collection(db, BANDS_COLLECTION, id, BAND_SETLISTS_COLLECTION)),
      ]);
      await Promise.all([
        ...songsSnap.docs.map((entry) => deleteDoc(entry.ref)),
        ...songListsSnap.docs.map((entry) => deleteDoc(entry.ref)),
        ...setlistsSnap.docs.map((entry) => deleteDoc(entry.ref)),
      ]);
      await deleteDoc(doc(db, BANDS_COLLECTION, id));
    }
  },

  async createInviteLink(bandId): Promise<BandInvite> {
    const uid = currentUid();
    if (!uid) throw new Error('You need to be signed in to create invite links.');
    const userEmail = auth?.currentUser?.email ?? '';
    return createBandInviteLinkOnServer({ userId: uid, userEmail, bandId });
  },

  async acceptInvite(inviteId) {
    const uid = currentUid();
    if (!uid) throw new Error('You need to be signed in to accept invites.');
    const userEmail = auth?.currentUser?.email ?? '';
    const response = await acceptBandInviteOnServer({ userId: uid, userEmail, inviteId });
    if (!db) throw new Error('Bands require cloud sync.');
    const snap = await getDoc(doc(db, BANDS_COLLECTION, response.bandId));
    return normalizeBand(response.bandId, (snap.data() ?? {}) as Record<string, unknown>);
  },

  async removeMember(bandId, userId) {
    const uid = currentUid();
    if (!uid) throw new Error('Bands require a signed-in account.');
    const userEmail = auth?.currentUser?.email ?? '';
    await removeBandMemberOnServer({ userId: uid, userEmail, bandId, memberId: userId });
  },
};

/**
 * Riders reuse `makeBandScopedClient`'s Firestore `list`/`update`/`remove`, but `create`
 * is extracted from `BandsContext.tsx`'s old `addBandInputList`: it goes through the
 * `create-rider` Cloud Function rather than a direct `setDoc` so the free-plan rider
 * limit is enforced server-side against a fresh read, same as before this refactor.
 */
const bandRidersClient: BandScopedCrudClient<InputList> = {
  ...makeBandScopedClient<InputList>(BAND_INPUT_LISTS_COLLECTION, normalizeInputList),
  async create(bandId, item) {
    const uid = currentUid();
    if (!uid) throw new Error('Band riders require a signed-in account.');
    const userEmail = auth?.currentUser?.email ?? '';
    const response = await createBandRiderOnServer({ userId: uid, userEmail, bandId, name: item.name });
    const now = new Date().toISOString();
    return {
      ...item,
      id: response.riderId,
      sortOrder: response.sortOrder,
      createdAt: now,
      updatedAt: now,
    };
  },
};

/**
 * Extracted from `PublicBandRiderPage.tsx`'s old direct Firestore read. The band-doc
 * read for `logo` requires auth under `firestore.rules`, so an anonymous visitor can
 * never resolve it — matches the page's pre-existing silent fallback to `null`, not a
 * regression. (Only the self-host `apiClient` path can improve on this, since Postgres
 * has no per-row rules blocking that join.)
 */
const publicRidersClient: PublicRidersClient = {
  async get(bandId, riderId) {
    if (!db) return null;
    const firestore = db;
    const snapshot = await getDoc(doc(firestore, BANDS_COLLECTION, bandId, BAND_INPUT_LISTS_COLLECTION, riderId));
    if (!snapshot.exists()) return null;

    const data = snapshot.data() as Record<string, unknown>;
    if (data.publicShareEnabled !== true) return null;

    const rider = normalizeInputList(snapshot.id, data);

    let bandLogo: string | null = null;
    try {
      const bandSnap = await getDoc(doc(firestore, BANDS_COLLECTION, bandId));
      if (bandSnap.exists()) {
        const bandData = bandSnap.data() as Record<string, unknown>;
        bandLogo = typeof bandData.logo === 'string' ? bandData.logo : null;
      }
    } catch {
      bandLogo = null;
    }

    const result: PublicRider = { rider, bandName: rider.bandName ?? '', bandLogo };
    return result;
  },
};

/**
 * Press kits. Extracted from `BandsContext.tsx`'s old `refreshBandPressKits`/`addBandPressKit`
 * Firestore logic (list/update/remove reuse `makeBandScopedClient`, same as riders; `create`
 * goes through the `create-press-kit` Cloud Function so the free-plan press-kit limit is
 * enforced server-side, mirroring `bandRidersClient.create` above).
 */

export const BAND_PRESS_KITS_COLLECTION = 'pressKits';
export const BAND_PRESS_KIT_IMAGES_COLLECTION = 'pressKitImages';

export function normalizePressKit(id: string, data: Record<string, unknown>): PressKit {
  return {
    id,
    name: typeof data.name === 'string' ? data.name : 'Unnamed Kit',
    icon: typeof data.icon === 'string' ? data.icon : undefined,
    richText: typeof data.richText === 'string' ? data.richText : '',
    imageIds: Array.isArray(data.imageIds)
      ? data.imageIds.filter((entry): entry is string => typeof entry === 'string')
      : [],
    videoUrls: Array.isArray(data.videoUrls)
      ? data.videoUrls.filter((entry): entry is string => typeof entry === 'string')
      : [],
    selectedVideoUrls: Array.isArray(data.selectedVideoUrls)
      ? data.selectedVideoUrls.filter((entry): entry is string => typeof entry === 'string')
      : undefined,
    presaveReleaseName: typeof data.presaveReleaseName === 'string' ? data.presaveReleaseName : undefined,
    presaveReleaseDate: typeof data.presaveReleaseDate === 'string' ? data.presaveReleaseDate : undefined,
    presaveUrls: Array.isArray(data.presaveUrls)
      ? data.presaveUrls.filter((entry): entry is string => typeof entry === 'string')
      : [],
    selectedPresaveUrls: Array.isArray(data.selectedPresaveUrls)
      ? data.selectedPresaveUrls.filter((entry): entry is string => typeof entry === 'string')
      : undefined,
    createdAt: typeof data.createdAt === 'string' ? data.createdAt : undefined,
  };
}

const bandPressKitsClient: BandScopedCrudClient<PressKit> = {
  ...makeBandScopedClient<PressKit>(BAND_PRESS_KITS_COLLECTION, normalizePressKit),
  async create(bandId, item) {
    const uid = currentUid();
    if (!uid) throw new Error('Band press kits require a signed-in account.');
    const userEmail = auth?.currentUser?.email ?? '';
    const response = await createBandPressKitOnServer({ userId: uid, userEmail, bandId, name: item.name });
    const now = new Date().toISOString();
    return {
      ...item,
      id: response.kitId,
      richText: '',
      imageIds: [],
      createdAt: now,
    };
  },
};

function normalizePressKitImage(id: string, data: Record<string, unknown>): PressKitImage {
  const url = typeof data.url === 'string' ? data.url : '';
  const thumbUrl = typeof data.thumbUrl === 'string' && data.thumbUrl.length > 0 ? data.thumbUrl : url;
  return {
    id,
    title: typeof data.title === 'string' ? data.title : 'Image',
    url,
    thumbUrl,
    mimeType: typeof data.mimeType === 'string' ? data.mimeType : '',
    sizeBytes: typeof data.sizeBytes === 'number' ? data.sizeBytes : 0,
    thumbSizeBytes: typeof data.thumbSizeBytes === 'number' ? data.thumbSizeBytes : 0,
    createdAt: typeof data.createdAt === 'string' ? data.createdAt : new Date(0).toISOString(),
    createdBy: typeof data.createdBy === 'string' ? data.createdBy : undefined,
  };
}

/**
 * Press kit images. Extracted from `PressKitView.tsx`'s old `uploadImages`/`removeImageAsset`
 * (band-scoped, not kit-scoped — flat `pressKitImages` collection referenced by id from each
 * kit's `imageIds`). Thumbnailing itself stays client-side (`createWebpThumbnail`, called by
 * the caller before `upload` is invoked); this only performs the two Storage uploads + the
 * Firestore doc write. `remove` replicates the old inline trash-write + kit-unlinking scan,
 * now centralized here so both `apiClient` and this module honor the same
 * `PressKitImagesClient` contract (self-host does the equivalent server-side).
 */
const bandPressKitImagesClient: PressKitImagesClient = {
  async list(bandId) {
    if (!db) return [];
    const snapshot = await getDocs(collection(db, BANDS_COLLECTION, bandId, BAND_PRESS_KIT_IMAGES_COLLECTION));
    return snapshot.docs
      .map((entry) => normalizePressKitImage(entry.id, entry.data() as Record<string, unknown>))
      .filter((image) => image.url.length > 0)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async upload(bandId, file, thumbnail) {
    if (!db || !storage) throw new Error('Press kit images require cloud sync.');
    const firestore = db;
    const uid = currentUid();

    const ext = file.name.includes('.') ? file.name.split('.').pop()?.toLowerCase() ?? 'bin' : 'bin';
    const imageId = crypto.randomUUID();
    const sanitizedName = file.name.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'image';
    const storagePath = `bands/${bandId}/presskit/images/${imageId}-${sanitizedName}.${ext}`;
    const thumbStoragePath = `bands/${bandId}/presskit/images/${imageId}-thumb.webp`;

    const fileRef = storageRef(storage, storagePath);
    await uploadBytes(fileRef, file, {
      contentType: file.type || undefined,
      cacheControl: 'public,max-age=31536000,immutable',
    });
    const url = await getDownloadURL(fileRef);

    const thumbRef = storageRef(storage, thumbStoragePath);
    await uploadBytes(thumbRef, thumbnail, {
      contentType: 'image/webp',
      cacheControl: 'public,max-age=31536000,immutable',
    });
    const thumbUrl = await getDownloadURL(thumbRef);

    const title = file.name.replace(/\.[^.]+$/, '').trim() || 'Image';
    const createdAt = new Date().toISOString();

    await setDoc(doc(firestore, BANDS_COLLECTION, bandId, BAND_PRESS_KIT_IMAGES_COLLECTION, imageId), {
      title,
      url,
      thumbUrl,
      storagePath,
      thumbStoragePath,
      mimeType: file.type || null,
      sizeBytes: file.size,
      thumbSizeBytes: thumbnail.size,
      createdAt,
      createdBy: uid ?? null,
    });

    return {
      id: imageId,
      title,
      url,
      thumbUrl,
      mimeType: file.type || '',
      sizeBytes: file.size,
      thumbSizeBytes: thumbnail.size,
      createdAt,
      createdBy: uid ?? undefined,
    };
  },

  async remove(bandId, imageId) {
    if (!db) return;
    const firestore = db;

    const imageSnap = await getDoc(doc(firestore, BANDS_COLLECTION, bandId, BAND_PRESS_KIT_IMAGES_COLLECTION, imageId));
    if (!imageSnap.exists()) return;
    const data = imageSnap.data() as Record<string, unknown>;

    const kitsSnapshot = await getDocs(collection(firestore, BANDS_COLLECTION, bandId, BAND_PRESS_KITS_COLLECTION));
    const linkedPressKitIds = kitsSnapshot.docs
      .filter((entry) => {
        const kitData = entry.data() as Record<string, unknown>;
        return Array.isArray(kitData.imageIds) && kitData.imageIds.includes(imageId);
      })
      .map((entry) => entry.id);

    const { deletedAt, purgeAt } = createTrashTimestamps();
    const trashId = crypto.randomUUID();
    const now = new Date().toISOString();

    await Promise.all([
      setDoc(
        doc(firestore, BANDS_COLLECTION, bandId, TRASH_COLLECTION, trashId),
        createTrashPayload('pressKitImage', deletedAt, purgeAt, {
          image: {
            id: imageId,
            title: typeof data.title === 'string' ? data.title : 'Image',
            url: typeof data.url === 'string' ? data.url : '',
            thumbUrl: typeof data.thumbUrl === 'string' ? data.thumbUrl : undefined,
            storagePath: typeof data.storagePath === 'string' ? data.storagePath : undefined,
            thumbStoragePath: typeof data.thumbStoragePath === 'string' ? data.thumbStoragePath : undefined,
            mimeType: typeof data.mimeType === 'string' ? data.mimeType : undefined,
            sizeBytes: typeof data.sizeBytes === 'number' ? data.sizeBytes : undefined,
            thumbSizeBytes: typeof data.thumbSizeBytes === 'number' ? data.thumbSizeBytes : undefined,
            createdAt: typeof data.createdAt === 'string' ? data.createdAt : undefined,
            createdBy: typeof data.createdBy === 'string' ? data.createdBy : undefined,
          },
          linkedPressKitIds,
        })
      ),
      deleteDoc(doc(firestore, BANDS_COLLECTION, bandId, BAND_PRESS_KIT_IMAGES_COLLECTION, imageId)),
      ...kitsSnapshot.docs
        .filter((entry) => linkedPressKitIds.includes(entry.id))
        .map((entry) => {
          const kitData = entry.data() as Record<string, unknown>;
          const imageIds = Array.isArray(kitData.imageIds)
            ? kitData.imageIds.filter((value): value is string => typeof value === 'string' && value !== imageId)
            : [];
          return setDoc(
            doc(firestore, BANDS_COLLECTION, bandId, BAND_PRESS_KITS_COLLECTION, entry.id),
            { imageIds, updatedAt: now },
            { merge: true }
          );
        }),
    ]);
  },
};

/**
 * Press kit public sharing. Extracted from `PressKitView.tsx`'s old `handleShare`/
 * `handleDisable` (via `src/lib/pressKitApi.ts`'s Cloud-Function-backed helpers — already a
 * plain HTTP call, not raw Firestore SDK usage). `disable` has no token in its signature per
 * the `PressKitSharesClient` contract, so it re-fetches the active share first (one extra
 * round trip, functionally equivalent to the old call site which already had the token from
 * local component state).
 */
const bandPressKitSharesClient: PressKitSharesClient = {
  async get(bandId, kitId) {
    const uid = currentUid();
    if (!uid) return null;
    const userEmail = auth?.currentUser?.email ?? '';
    const share = await getActivePressKitShare(uid, userEmail, bandId, kitId);
    return share ? { token: share.token, publicUrl: share.publicUrl } : null;
  },
  async create(bandId, kitId) {
    const uid = currentUid();
    if (!uid) throw new Error('You need to be signed in to share.');
    const userEmail = auth?.currentUser?.email ?? '';
    const result = await createPressKitShare({
      userId: uid,
      userEmail,
      bandId,
      kitId,
      selectedStageplotIds: [],
      selectedRiderIds: [],
    });
    return { token: result.token, publicUrl: result.publicUrl };
  },
  async disable(bandId, kitId) {
    const uid = currentUid();
    if (!uid) throw new Error('You need to be signed in.');
    const userEmail = auth?.currentUser?.email ?? '';
    const share = await getActivePressKitShare(uid, userEmail, bandId, kitId);
    if (!share) return;
    await disablePressKitShare(uid, userEmail, bandId, kitId, share.token);
  },
};

/**
 * Public press-kit read, keyed by share token. Extracted from `src/lib/pressKitApi.ts`'s
 * `fetchPublicPressKit` (already a plain HTTP fetch against the
 * `functions/api/public/press-kit/[token].ts` Cloud Function, not a direct Firestore SDK
 * call) and adapted from that endpoint's flattened `{texts, images: {title,url}[], ...}`
 * shape into the `PublicPressKit` contract's `{kit: PressKit, images: PressKitImage[]}`
 * shape — the aggregator only ever emits at most one `texts` entry today (the kit's
 * `richText` wrapped as `{title: kitName, body: richText}`, see
 * `functions/_helpers/press-kit-data.ts`), so that single entry maps back to `kit.richText`/
 * `kit.name` directly. `images` don't carry ids or thumb URLs in this legacy payload, so
 * synthetic ids are derived from title+url and `thumbUrl` falls back to `url`.
 */
const publicPressKitsClient: PublicPressKitsClient = {
  async get(token) {
    let payload;
    try {
      payload = await fetchPublicPressKit(token);
    } catch {
      return null;
    }

    const primaryText = payload.texts[0];
    const kit: PressKit = {
      id: token,
      name: primaryText?.title || 'Press Kit',
      icon: payload.pressKitIcon,
      richText: primaryText?.body ?? '',
      imageIds: payload.images.map((_, index) => String(index)),
      videoUrls: payload.videoUrls,
      selectedVideoUrls: payload.videoUrls,
      presaveReleaseName: payload.presaveReleaseName,
      presaveReleaseDate: payload.presaveReleaseDate,
      presaveUrls: payload.presaveUrls,
      selectedPresaveUrls: payload.presaveUrls,
      createdAt: payload.createdAt,
    };

    const images: PressKitImage[] = payload.images.map((image, index) => ({
      id: String(index),
      title: image.title,
      url: image.url,
      thumbUrl: image.url,
      mimeType: '',
      sizeBytes: 0,
      thumbSizeBytes: 0,
      createdAt: payload.createdAt ?? new Date(0).toISOString(),
    }));

    return {
      kit,
      bandName: payload.bandName,
      bandLogo: payload.bandLogo ?? null,
      images,
    };
  },
};

/**
 * Attachments. Extracted from `useSongAttachments.ts`'s old direct calls into
 * `songAttachments.ts` — that module's Firestore/Storage functions are unchanged (still
 * the hosted-SaaS implementation, including today's soft "move to trash" delete behavior),
 * this just wires them up behind the `AttachmentsClient`/`BandAttachmentsClient` contract
 * so callers go through `dataClient` like every other Phase 1-3 resource. Personal scope's
 * `ownerId` and the uploader identity are resolved from the current Firebase Auth user here
 * (same `auth.currentUser` pattern `currentUid()`/`resolveUser` already use above) rather
 * than requiring extra params, keeping the pre-written `types.ts` contract clean.
 */

async function currentUploaderIdentity(): Promise<UploaderIdentity | null> {
  const uid = currentUid();
  if (!uid) return null;
  const email = auth?.currentUser?.email ?? '';
  if (!db) return { userId: uid, displayName: email || 'Unknown', avatar: null };

  try {
    const profile = await loadUserProfile(db, uid);
    const displayName = profile?.fullName?.trim() || profile?.username?.trim() || email || 'Unknown';
    return { userId: uid, displayName, avatar: profile?.avatar ?? null };
  } catch {
    return { userId: uid, displayName: email || 'Unknown', avatar: null };
  }
}

async function fetchSongTitle(scope: { type: 'user'; ownerId: string } | { type: 'band'; bandId: string }, songId: string): Promise<string> {
  if (!db) return '';
  const songRef = scope.type === 'band'
    ? doc(db, BANDS_COLLECTION, scope.bandId, BAND_SONGS_COLLECTION, songId)
    : doc(db, 'users', scope.ownerId, SONGS_COLLECTION, songId);
  const snap = await getDoc(songRef);
  const data = snap.data() as Record<string, unknown> | undefined;
  return readFirstNonEmptyString(data?.title, data?.name) ?? '';
}

const attachmentsClient: AttachmentsClient = {
  async list(songId) {
    const uid = currentUid();
    if (!db || !uid) return [];
    return loadSongAttachments(db, storage, { type: 'user', ownerId: uid }, songId);
  },
  async upload(songId, file) {
    const uid = currentUid();
    if (!db || !storage || !uid) throw new Error('Attachments require a signed-in account.');
    const uploader = await currentUploaderIdentity();
    if (!uploader) throw new Error('Attachments require a signed-in account.');
    return uploadSongAttachment(db, storage, { type: 'user', ownerId: uid }, songId, file, uploader);
  },
  async rename(songId, attachmentId, name) {
    const uid = currentUid();
    if (!db || !uid) return;
    // Only `attachment.id` is read by `renameSongAttachment`, so a minimal stub avoids an extra fetch.
    await renameSongAttachment(db, { type: 'user', ownerId: uid }, songId, { id: attachmentId } as SongAttachment, name);
  },
  async remove(songId, attachmentId) {
    const uid = currentUid();
    if (!db || !uid) return;
    const scope = { type: 'user' as const, ownerId: uid };
    const [attachments, songTitle] = await Promise.all([
      loadSongAttachments(db, storage, scope, songId),
      fetchSongTitle(scope, songId),
    ]);
    const attachment = attachments.find((a) => a.id === attachmentId);
    if (!attachment) return;
    await moveSongAttachmentToTrash(db, scope, songId, songTitle, attachment);
  },
};

const bandAttachmentsClient: BandAttachmentsClient = {
  async list(bandId, songId) {
    if (!db) return [];
    return loadSongAttachments(db, storage, { type: 'band', bandId }, songId);
  },
  async upload(bandId, songId, file) {
    if (!db || !storage) throw new Error('Attachments require a signed-in account.');
    const uploader = await currentUploaderIdentity();
    if (!uploader) throw new Error('Attachments require a signed-in account.');
    return uploadSongAttachment(db, storage, { type: 'band', bandId }, songId, file, uploader);
  },
  async rename(bandId, songId, attachmentId, name) {
    if (!db) return;
    await renameSongAttachment(db, { type: 'band', bandId }, songId, { id: attachmentId } as SongAttachment, name);
  },
  async remove(bandId, songId, attachmentId) {
    if (!db) return;
    const scope = { type: 'band' as const, bandId };
    const [attachments, songTitle] = await Promise.all([
      loadSongAttachments(db, storage, scope, songId),
      fetchSongTitle(scope, songId),
    ]);
    const attachment = attachments.find((a) => a.id === attachmentId);
    if (!attachment) return;
    await moveSongAttachmentToTrash(db, scope, songId, songTitle, attachment);
  },
};

/**
 * Personal + band trash. Extracted from the trash logic that already lived (but was
 * mostly unwired for personal use) in `SongsContext`/`SongListsContext`/`SetlistsContext`/
 * `BandsContext`/`songAttachments.ts` — this module doesn't reuse those contexts directly
 * (they hold React state and per-type optimistic-update logic that stays in place), it
 * re-derives the same Firestore reads/writes standalone so `dataClient.trash`/`bandTrash`
 * work independently of any particular context, per the `DataClient` contract.
 */

type TrashScope = { kind: 'user'; id: string } | { kind: 'band'; id: string };

function trashCollectionForScope(firestore: NonNullable<typeof db>, scope: TrashScope) {
  return scope.kind === 'band'
    ? collection(firestore, BANDS_COLLECTION, scope.id, TRASH_COLLECTION)
    : collection(firestore, 'users', scope.id, TRASH_COLLECTION);
}

function trashDocForScope(firestore: NonNullable<typeof db>, scope: TrashScope, trashId: string) {
  return scope.kind === 'band'
    ? doc(firestore, BANDS_COLLECTION, scope.id, TRASH_COLLECTION, trashId)
    : doc(firestore, 'users', scope.id, TRASH_COLLECTION, trashId);
}

function attachmentsScopeFor(scope: TrashScope): AttachmentsScope {
  return scope.kind === 'band' ? { type: 'band', bandId: scope.id } : { type: 'user', ownerId: scope.id };
}

function parseAnyTrashRecord(id: string, raw: Record<string, unknown>) {
  return (
    parseSongTrashRecord(id, raw)
    ?? parseSongListTrashRecord(id, raw)
    ?? parseSetlistTrashRecord(id, raw)
    ?? parseInputListTrashRecord(id, raw)
    ?? parsePressKitTrashRecord(id, raw)
    ?? parsePressKitImageTrashRecord(id, raw)
    ?? parseBandLogoTrashRecord(id, raw)
    ?? parseAttachmentTrashRecord(id, raw)
    ?? null
  );
}

type AnyTrashRecord = NonNullable<ReturnType<typeof parseAnyTrashRecord>>;

function trashRecordName(record: AnyTrashRecord): string {
  switch (record.itemType) {
    case 'song': return record.data.title || 'Untitled song';
    case 'songlist': return record.data.name || 'Untitled songlist';
    case 'setlist': return record.data.name || 'Untitled setlist';
    case 'technicalRider': return record.data.name || 'Untitled input list';
    case 'pressKit': return record.data.name || 'Untitled press kit';
    case 'pressKitImage': return record.data.image.title || 'Untitled image';
    case 'bandLogo': return record.data.image.title || 'Band logo';
    case 'attachment': return record.data.attachment.name || 'Untitled attachment';
    default: return 'Untitled item';
  }
}

async function deleteTrashStorageAssets(record: AnyTrashRecord) {
  if (!storage) return;
  const deletions: Promise<unknown>[] = [];
  if (record.itemType === 'attachment' && record.data.attachment.storagePath) {
    deletions.push(deleteObject(storageRef(storage, record.data.attachment.storagePath)).catch(() => undefined));
  }
  if (record.itemType === 'pressKitImage' || record.itemType === 'bandLogo') {
    if (record.data.image.storagePath) {
      deletions.push(deleteObject(storageRef(storage, record.data.image.storagePath)).catch(() => undefined));
    }
    if (record.data.image.thumbStoragePath) {
      deletions.push(deleteObject(storageRef(storage, record.data.image.thumbStoragePath)).catch(() => undefined));
    }
  }
  await Promise.all(deletions);
}

async function linkImageToPressKits(firestore: NonNullable<typeof db>, bandId: string, imageId: string, kitIds: string[]) {
  if (kitIds.length === 0) return;
  const kitsSnap = await getDocs(collection(firestore, BANDS_COLLECTION, bandId, 'pressKits'));
  const now = new Date().toISOString();
  await Promise.all(
    kitsSnap.docs
      .filter((entry) => kitIds.includes(entry.id))
      .map((entry) => {
        const data = entry.data() as Record<string, unknown>;
        const imageIds = Array.isArray(data.imageIds)
          ? data.imageIds.filter((value): value is string => typeof value === 'string')
          : [];
        if (imageIds.includes(imageId)) return Promise.resolve();
        return setDoc(entry.ref, { imageIds: [...imageIds, imageId], updatedAt: now }, { merge: true });
      })
  );
}

async function listAndSweepTrash(scope: TrashScope): Promise<TrashListItem[]> {
  if (!db) return [];
  const firestore = db;
  const snap = await getDocs(trashCollectionForScope(firestore, scope));
  const now = Date.now();

  const parsed = snap.docs
    .map((entry) => parseAnyTrashRecord(entry.id, entry.data() as Record<string, unknown>))
    .filter((entry): entry is AnyTrashRecord => entry !== null);

  const expired = parsed.filter((entry) => isTrashExpired(entry.purgeAt, now));
  const active = parsed.filter((entry) => !isTrashExpired(entry.purgeAt, now));

  if (expired.length > 0) {
    await Promise.allSettled(
      expired.map(async (entry) => {
        await deleteTrashStorageAssets(entry);
        await deleteDoc(trashDocForScope(firestore, scope, entry.id));
      })
    );
  }

  return active
    .map((entry) => ({
      trashId: entry.id,
      itemType: entry.itemType,
      name: trashRecordName(entry),
      deletedAt: entry.deletedAt,
      purgeAt: entry.purgeAt,
    }))
    .sort(compareTrashByDeletedAtDesc);
}

/**
 * Restores a trashed item to its live collection. Band-scoped list resources
 * (songlist/setlist/rider) are appended to the end via a fresh, large `sortOrder`
 * rather than re-fetching and recompacting every sibling's `sortOrder` — cheaper and
 * still correct ordering-wise, since any later reorder already recomputes sequential
 * values from scratch. Personal songs/songlists/setlists restore to their original
 * `sortOrder`, matching today's hosted-SaaS behavior.
 */
async function restoreTrashRecord(scope: TrashScope, trashId: string): Promise<string | null> {
  if (!db) return 'Trash requires cloud sync.';
  const firestore = db;

  try {
    const trashRef = trashDocForScope(firestore, scope, trashId);
    const snap = await getDoc(trashRef);
    if (!snap.exists()) return 'Item was not found in trash.';

    const record = parseAnyTrashRecord(trashId, snap.data() as Record<string, unknown>);
    if (!record) return 'Trash item could not be read.';

    if (record.itemType === 'attachment') {
      const trashedAttachment: TrashedSongAttachment = {
        trashId: record.id,
        deletedAt: record.deletedAt,
        purgeAt: record.purgeAt,
        songId: record.data.songId,
        songTitle: record.data.songTitle,
        attachment: record.data.attachment,
      };
      await restoreSongAttachmentFromTrash(firestore, attachmentsScopeFor(scope), trashedAttachment);
      return null;
    }

    if (record.itemType === 'song') {
      const docRef = scope.kind === 'band'
        ? doc(firestore, BANDS_COLLECTION, scope.id, BAND_SONGS_COLLECTION, record.id)
        : doc(firestore, 'users', scope.id, SONGS_COLLECTION, record.id);
      await setDoc(docRef, stripUndefined(record.data));
    } else if (record.itemType === 'songlist') {
      const docRef = scope.kind === 'band'
        ? doc(firestore, BANDS_COLLECTION, scope.id, BAND_SONGLISTS_COLLECTION, record.id)
        : doc(firestore, 'users', scope.id, SONG_LISTS_COLLECTION, record.id);
      const payload = scope.kind === 'band' ? { ...record.data, sortOrder: Date.now() } : record.data;
      await setDoc(docRef, stripUndefined(payload));
    } else if (record.itemType === 'setlist') {
      const docRef = scope.kind === 'band'
        ? doc(firestore, BANDS_COLLECTION, scope.id, BAND_SETLISTS_COLLECTION, record.id)
        : doc(firestore, 'users', scope.id, SETLISTS_COLLECTION, record.id);
      const payload = scope.kind === 'band' ? { ...record.data, sortOrder: Date.now() } : record.data;
      await setDoc(docRef, stripUndefined(payload));
    } else if (record.itemType === 'technicalRider') {
      if (scope.kind !== 'band') return 'Technical riders only exist for bands.';
      const docRef = doc(firestore, BANDS_COLLECTION, scope.id, BAND_INPUT_LISTS_COLLECTION, record.id);
      await setDoc(docRef, stripUndefined({ ...record.data, sortOrder: Date.now() }));
    } else if (record.itemType === 'pressKit') {
      if (scope.kind !== 'band') return 'Press kits only exist for bands.';
      const docRef = doc(firestore, BANDS_COLLECTION, scope.id, 'pressKits', record.id);
      await setDoc(docRef, stripUndefined(record.data));
    } else if (record.itemType === 'pressKitImage') {
      if (scope.kind !== 'band') return 'Press kit images only exist for bands.';
      const image = record.data.image;
      await setDoc(doc(firestore, BANDS_COLLECTION, scope.id, 'pressKitImages', image.id), {
        title: image.title,
        url: image.url,
        thumbUrl: image.thumbUrl ?? null,
        storagePath: image.storagePath ?? null,
        thumbStoragePath: image.thumbStoragePath ?? null,
        mimeType: image.mimeType ?? null,
        sizeBytes: image.sizeBytes ?? null,
        thumbSizeBytes: image.thumbSizeBytes ?? null,
        createdAt: image.createdAt ?? null,
        createdBy: image.createdBy ?? null,
      });
      await linkImageToPressKits(firestore, scope.id, image.id, record.data.linkedPressKitIds ?? []);
    } else if (record.itemType === 'bandLogo') {
      if (scope.kind !== 'band') return 'Band logos only exist for bands.';
      const image = record.data.image;
      const now = new Date().toISOString();
      await setDoc(doc(firestore, BANDS_COLLECTION, scope.id), {
        logo: image.url,
        logoStoragePath: image.storagePath ?? null,
        updatedAt: now,
      }, { merge: true });
      await setDoc(doc(firestore, BANDS_COLLECTION, scope.id, 'pressKitImages', 'band-logo'), {
        title: image.title,
        url: image.url,
        thumbUrl: image.thumbUrl ?? null,
        storagePath: image.storagePath ?? null,
        thumbStoragePath: image.thumbStoragePath ?? null,
        mimeType: image.mimeType ?? null,
        sizeBytes: image.sizeBytes ?? null,
        thumbSizeBytes: image.thumbSizeBytes ?? null,
        createdAt: image.createdAt ?? null,
        createdBy: image.createdBy ?? null,
      });
      await linkImageToPressKits(firestore, scope.id, 'band-logo', record.data.linkedPressKitIds ?? []);
    } else {
      return 'Unsupported trash item type.';
    }

    await deleteDoc(trashRef);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : 'Failed to restore item.';
  }
}

async function removeTrashRecordPermanently(scope: TrashScope, trashId: string): Promise<string | null> {
  if (!db) return 'Trash requires cloud sync.';
  const firestore = db;

  try {
    const trashRef = trashDocForScope(firestore, scope, trashId);
    const snap = await getDoc(trashRef);
    if (!snap.exists()) return null;

    const record = parseAnyTrashRecord(trashId, snap.data() as Record<string, unknown>);

    if (record?.itemType === 'attachment' && storage) {
      const trashedAttachment: TrashedSongAttachment = {
        trashId: record.id,
        deletedAt: record.deletedAt,
        purgeAt: record.purgeAt,
        songId: record.data.songId,
        songTitle: record.data.songTitle,
        attachment: record.data.attachment,
      };
      await deleteSongAttachmentPermanently(firestore, storage, attachmentsScopeFor(scope), trashedAttachment);
      return null;
    }

    if (record && (record.itemType === 'pressKitImage' || record.itemType === 'bandLogo')) {
      await deleteTrashStorageAssets(record);
      if (record.itemType === 'pressKitImage' && scope.kind === 'band') {
        await deleteDoc(doc(firestore, BANDS_COLLECTION, scope.id, 'pressKitImages', record.data.image.id)).catch(() => undefined);
      }
    }

    await deleteDoc(trashRef);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : 'Failed to permanently delete item.';
  }
}

async function emptyTrashForScope(scope: TrashScope): Promise<string | null> {
  if (!db) return 'Trash requires cloud sync.';
  const snap = await getDocs(trashCollectionForScope(db, scope));

  const results = await Promise.allSettled(
    snap.docs.map((entry) => removeTrashRecordPermanently(scope, entry.id))
  );
  const failureCount = results.filter((entry) => (entry.status === 'fulfilled' ? entry.value !== null : true)).length;

  if (failureCount === 0) return null;
  if (failureCount === snap.docs.length) return 'Failed to empty trash.';
  const succeeded = snap.docs.length - failureCount;
  return `Deleted ${succeeded} item${succeeded === 1 ? '' : 's'}, but ${failureCount} item${failureCount === 1 ? '' : 's'} could not be deleted.`;
}

const trashClient: TrashClient = {
  list() {
    const uid = currentUid();
    return uid ? listAndSweepTrash({ kind: 'user', id: uid }) : Promise.resolve([]);
  },
  restore(trashId) {
    const uid = currentUid();
    return uid ? restoreTrashRecord({ kind: 'user', id: uid }, trashId) : Promise.resolve('You need to be signed in.');
  },
  remove(trashId) {
    const uid = currentUid();
    return uid ? removeTrashRecordPermanently({ kind: 'user', id: uid }, trashId) : Promise.resolve('You need to be signed in.');
  },
  empty() {
    const uid = currentUid();
    return uid ? emptyTrashForScope({ kind: 'user', id: uid }) : Promise.resolve('You need to be signed in.');
  },
};

const bandTrashClient: BandTrashClient = {
  list(bandId) {
    return listAndSweepTrash({ kind: 'band', id: bandId });
  },
  restore(bandId, trashId) {
    return restoreTrashRecord({ kind: 'band', id: bandId }, trashId);
  },
  remove(bandId, trashId) {
    return removeTrashRecordPermanently({ kind: 'band', id: bandId }, trashId);
  },
  empty(bandId) {
    return emptyTrashForScope({ kind: 'band', id: bandId });
  },
};

export const firebaseClient: DataClient = {
  auth: authClient,
  songs: makeOwnedCollectionClient<Song>(SONGS_COLLECTION, songFromOwnedDoc),
  songLists: makeOwnedCollectionClient<SongList>(SONG_LISTS_COLLECTION, songListFromDoc),
  setlists: makeOwnedCollectionClient<Setlist>(SETLISTS_COLLECTION, setlistFromDoc),
  bands: bandsClient,
  bandSongs: makeBandScopedClient<Song>(BAND_SONGS_COLLECTION, normalizeBandSong),
  bandSongLists: makeBandScopedClient<SongList>(BAND_SONGLISTS_COLLECTION, normalizeBandSongList),
  bandSetlists: makeBandScopedClient<Setlist>(BAND_SETLISTS_COLLECTION, normalizeBandSetlist),
  bandRiders: bandRidersClient,
  publicRiders: publicRidersClient,
  attachments: attachmentsClient,
  bandAttachments: bandAttachmentsClient,
  trash: trashClient,
  bandTrash: bandTrashClient,
  bandPressKits: bandPressKitsClient,
  bandPressKitImages: bandPressKitImagesClient,
  bandPressKitShares: bandPressKitSharesClient,
  publicPressKits: publicPressKitsClient,
};
