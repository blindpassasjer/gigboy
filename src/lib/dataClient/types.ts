import type { Band, InputList, PressKit, Setlist, Song, SongList } from '../../types';
import type { User } from '../../context/AuthContext';
import type { SongAttachment } from '../songAttachments';
import type { TrashListItem } from '../../components/TrashView';

/**
 * Backend-agnostic contract for the data operations self-hosting covers so far:
 * auth, personal songs/songLists/setlists (Phase 1), bands + band-scoped
 * songs/songLists/setlists (Phase 2), band-scoped technical riders (Phase 3),
 * song attachments personal + band-scoped (Phase 4), trash/restore for all of
 * the above (Phase 5), and band press kits with public share links (Phase 6).
 * Implemented by `firebaseClient.ts` (today's Firestore-backed behavior, used
 * by the hosted SaaS) and `apiClient.ts` (self-host, talks to the
 * Express/Postgres server under `server/`). Selected once at startup by
 * `index.ts` based on `VITE_BACKEND`.
 *
 * Deliberately does not cover ad-hoc per-resource collaboration invites,
 * recordings, hand notes, or band logo upload — those stay Firestore-only
 * until a later phase.
 */
export interface DataClient {
  auth: AuthClient;
  songs: CrudClient<Song>;
  songLists: CrudClient<SongList>;
  setlists: CrudClient<Setlist>;
  bands: BandsClient;
  bandSongs: BandScopedCrudClient<Song>;
  bandSongLists: BandScopedCrudClient<SongList>;
  bandSetlists: BandScopedCrudClient<Setlist>;
  bandRiders: BandScopedCrudClient<InputList>;
  publicRiders: PublicRidersClient;
  attachments: AttachmentsClient;
  bandAttachments: BandAttachmentsClient;
  trash: TrashClient;
  bandTrash: BandTrashClient;
  bandPressKits: BandScopedCrudClient<PressKit>;
  bandPressKitImages: PressKitImagesClient;
  bandPressKitShares: PressKitSharesClient;
  publicPressKits: PublicPressKitsClient;
}

export interface AuthClient {
  /** Resolves the current session's user, or null if signed out. Used on app load. */
  getCurrentUser(): Promise<User | null>;
  /** Subscribes to auth state changes; returns an unsubscribe function. Fires once immediately. */
  onAuthStateChanged(callback: (user: User | null) => void): () => void;
  login(email: string, password: string): Promise<{ user: User | null; error: string | null }>;
  register(email: string, password: string, username: string): Promise<{ user: User | null; error: string | null }>;
  logout(): Promise<void>;
}

/**
 * Plain fetch/CRUD contract — no realtime subscriptions. Matches how SongsContext/
 * SongListsContext/SetlistsContext already talk to Firestore today (getDocs/setDoc/
 * deleteDoc, not onSnapshot), so this isn't a behavior change for the hosted SaaS.
 */
export interface CrudClient<T extends { id: string }> {
  list(): Promise<T[]>;
  create(item: T): Promise<T>;
  update(item: T): Promise<T>;
  remove(id: string): Promise<void>;
}

export interface BandInvite {
  inviteId: string;
  inviteUrl: string;
  expiresAt: string;
}

export interface BandsClient {
  /** Bands the current user is a member of (owner or editor). */
  list(): Promise<Band[]>;
  create(input: { name: string; description?: string; icon?: string }): Promise<Band>;
  update(id: string, input: { name?: string; description?: string; icon?: string }): Promise<Band>;
  /** Owner only. Cascades to the band's songs/songLists/setlists. */
  remove(id: string): Promise<void>;
  /** Editor+ only. Reusable multi-use link, valid until it expires (7 days) or is revoked. */
  createInviteLink(bandId: string): Promise<BandInvite>;
  /** Joins the current user to the invite's band as an editor. Returns the band. */
  acceptInvite(inviteId: string): Promise<Band>;
  /** Owner can remove any member; a user can remove themself (leave). */
  removeMember(bandId: string, userId: string): Promise<void>;
}

/**
 * Same shape as `CrudClient<T>` but scoped to a band — band-owned resources live on a
 * parallel path from personal ones (`bands/{bandId}/songs/...` vs `users/{uid}/songs/...`
 * in Firestore terms), matching `BandsContext.tsx`'s existing separate-context architecture
 * rather than unifying with `CrudClient<T>` via an optional bandId param.
 */
export interface BandScopedCrudClient<T extends { id: string }> {
  list(bandId: string): Promise<T[]>;
  create(bandId: string, item: T): Promise<T>;
  update(bandId: string, item: T): Promise<T>;
  remove(bandId: string, id: string): Promise<void>;
}

export interface PublicRider {
  rider: InputList;
  bandName: string;
  bandLogo: string | null;
}

/**
 * Unauthenticated read for a rider's public share page (`PublicBandRiderPage.tsx`),
 * which today reads Firestore directly rather than going through `BandsContext`.
 */
export interface PublicRidersClient {
  /** Null if the rider doesn't exist or isn't publicly shared. */
  get(bandId: string, riderId: string): Promise<PublicRider | null>;
}

/** PDF attachments on a personal song. Upload is plan-gated upstream (usePlan); list/rename/remove are not. */
export interface AttachmentsClient {
  list(songId: string): Promise<SongAttachment[]>;
  upload(songId: string, file: File): Promise<SongAttachment>;
  rename(songId: string, attachmentId: string, name: string): Promise<void>;
  /** Moves to trash (see `TrashClient`), not a hard delete — matches every other resource's `remove` as of Phase 5. */
  remove(songId: string, attachmentId: string): Promise<void>;
}

/**
 * Same shape as `AttachmentsClient` but scoped to a band-owned song. Any band member may
 * upload; rename/remove are restricted server-side to the original uploader, not gated by
 * editor role (matches today's `storage.rules` behavior).
 */
export interface BandAttachmentsClient {
  list(bandId: string, songId: string): Promise<SongAttachment[]>;
  upload(bandId: string, songId: string, file: File): Promise<SongAttachment>;
  rename(bandId: string, songId: string, attachmentId: string, name: string): Promise<void>;
  remove(bandId: string, songId: string, attachmentId: string): Promise<void>;
}

/**
 * Trash/restore for a signed-in user's own resources (songs, songLists, setlists,
 * attachments on their own songs). 30-day retention; `list()` sweeps expired rows first.
 * Return shape (`Promise<string | null>` = error message or null on success) matches
 * `TrashView.tsx`'s `onRestore`/`onDeletePermanently`/`onEmptyTrash` prop contract directly,
 * so callers can pass these methods straight through without adapting the shape.
 */
export interface TrashClient {
  list(): Promise<TrashListItem[]>;
  restore(trashId: string): Promise<string | null>;
  /** Permanent delete — also removes the underlying file for a trashed attachment. */
  remove(trashId: string): Promise<string | null>;
  empty(): Promise<string | null>;
}

/** Same shape as `TrashClient` but scoped to a band. List requires membership; mutations require editor role. */
export interface BandTrashClient {
  list(bandId: string): Promise<TrashListItem[]>;
  restore(bandId: string, trashId: string): Promise<string | null>;
  remove(bandId: string, trashId: string): Promise<string | null>;
  empty(bandId: string): Promise<string | null>;
}

/** A press-kit image asset. Band-scoped (not kit-scoped) — referenced by id from a `PressKit`'s `imageIds`. */
export interface PressKitImage {
  id: string;
  title: string;
  url: string;
  thumbUrl: string;
  mimeType: string;
  sizeBytes: number;
  thumbSizeBytes: number;
  createdAt: string;
  createdBy?: string;
}

/**
 * Images live per-band, not per-kit (`PressKit.imageIds` references entries here). Upload takes
 * both the full image and its thumbnail in one call — thumbnailing stays client-side (Canvas API,
 * see `src/utils/imageThumbnail.ts`), no server-side image processing is added. `remove` moves to
 * trash (`itemType: 'pressKitImage'`) and strips the id from any kit that referenced it, same as
 * today's Firestore behavior.
 */
export interface PressKitImagesClient {
  list(bandId: string): Promise<PressKitImage[]>;
  upload(bandId: string, file: File, thumbnail: Blob): Promise<PressKitImage>;
  remove(bandId: string, imageId: string): Promise<void>;
}

export interface PressKitShare {
  token: string;
  publicUrl: string;
}

/** Public sharing for one press kit — a real token table (unlike riders' boolean flag), multi-use until revoked. */
export interface PressKitSharesClient {
  /** The kit's currently active share, or null if none. */
  get(bandId: string, kitId: string): Promise<PressKitShare | null>;
  /** Editor+ only. */
  create(bandId: string, kitId: string): Promise<PressKitShare>;
  /** Editor+ only. */
  disable(bandId: string, kitId: string): Promise<void>;
}

export interface PublicPressKit {
  kit: PressKit;
  bandName: string;
  bandLogo: string | null;
  /** Resolved `PressKitImage` objects for the kit's `imageIds`, in order. */
  images: PressKitImage[];
}

/** Unauthenticated read for a press kit's public share page, keyed by share token. */
export interface PublicPressKitsClient {
  /** Null if the token doesn't exist or has been revoked. */
  get(token: string): Promise<PublicPressKit | null>;
}
