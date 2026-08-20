import type { Band, InputList, PressKit, Setlist, Song, SongList } from '../../types';
import type { User } from '../../context/AuthContext';
import type { SongAttachment } from '../songAttachments';
import type { TrashListItem } from '../../components/TrashView';

/**
 * Contract for self-host's data operations: auth, bands + band-scoped songs/songLists/setlists
 * (Phase 2), band-scoped technical riders (Phase 3), band-scoped song attachments (Phase 4),
 * band trash/restore (Phase 5), and band press kits with public share links (Phase 6). All
 * song/songlist/setlist content is band-owned — there is no personal-library equivalent.
 * Implemented by `apiClient.ts`, which talks to the Express/Postgres server under `server/`
 * — the only backend this app supports.
 *
 * Ad-hoc per-resource collaboration invites, recordings, hand notes, and band logo upload
 * are covered by separate self-host-only modules (`songRecordings.ts`, `songHandNotes.ts`,
 * `bandLogos.ts`) rather than this interface.
 */
export interface DataClient {
  auth: AuthClient;
  bands: BandsClient;
  bandSongs: BandScopedCrudClient<Song>;
  bandSongLists: BandScopedCrudClient<SongList>;
  bandSetlists: BandScopedCrudClient<Setlist>;
  bandRiders: BandScopedCrudClient<InputList>;
  publicRiders: PublicRidersClient;
  bandAttachments: BandAttachmentsClient;
  bandTrash: BandTrashClient;
  bandPressKits: BandScopedCrudClient<PressKit>;
  bandPressKitImages: PressKitImagesClient;
  bandPressKitShares: PressKitSharesClient;
  publicPressKits: PublicPressKitsClient;
  adminInvites: AdminInvitesClient;
  adminUsers: AdminUsersClient;
}

/** Result of looking up an invite token, mirroring `GET /api/invites/:token`'s success body. */
export interface InviteContext {
  /** Pre-filled by the inviter, or null when the accepting user must supply their own. */
  email: string | null;
  expiresAt: string;
}

/** Fields collected on the invite-accept form; `email` is required only when the invite has none pinned. */
export interface AcceptInviteInput {
  username: string;
  password: string;
  fullName?: string;
  email?: string;
}

export interface AuthClient {
  /** Resolves the current session's user, or null if signed out. Used on app load. */
  getCurrentUser(): Promise<User | null>;
  /** Subscribes to auth state changes; returns an unsubscribe function. Fires once immediately. */
  onAuthStateChanged(callback: (user: User | null) => void): () => void;
  login(email: string, password: string): Promise<{ user: User | null; error: string | null }>;
  /** Looks up an invite by token. Null invite + non-null error covers not-found/expired/revoked/already-used. */
  getInvite(token: string): Promise<{ invite: InviteContext | null; error: string | null }>;
  /** Accepts an invite, creating the account and (on success) signing it in via session cookie. */
  acceptInvite(token: string, input: AcceptInviteInput): Promise<{ user: User | null; error: string | null }>;
  logout(): Promise<void>;
  updateEmail(email: string): Promise<{ user: User | null; error: string | null }>;
  updateUsername(username: string): Promise<{ user: User | null; error: string | null }>;
  updateFullName(fullName: string): Promise<{ user: User | null; error: string | null }>;
  /** Requires the current password (re-auth). */
  updatePassword(currentPassword: string, newPassword: string): Promise<{ error: string | null }>;
  /** Permanently deletes the account. Self-host cascades via FKs; hosted SaaS calls the existing server-side cascade. */
  deleteAccount(): Promise<{ error: string | null }>;
}

/** A pending user invite as returned by `GET /api/admin/invites` (admin-only). */
export interface UserInvite {
  id: string;
  email: string | null;
  role: 'member' | 'admin';
  status: 'pending' | 'accepted' | 'revoked';
  createdAt: string;
  expiresAt: string;
}

/** Admin-only management of user invites, mounted at `/api/admin/invites`. Self-host has no
 * open self-registration — new accounts are created only by an admin generating an invite
 * link and sharing it out-of-band. */
export interface AdminInvitesClient {
  /** Lists pending invites. */
  list(): Promise<UserInvite[]>;
  /** Creates a new invite. `email` pins the invite to one address (optional); `role` defaults to `member`. */
  create(input: { email?: string; role?: 'member' | 'admin' }): Promise<{ inviteId: string; inviteUrl: string; expiresAt: string }>;
  /** Revokes a pending invite so its link can no longer be used. */
  revoke(id: string): Promise<void>;
}

/** A user row as returned by `GET /api/admin/users` (admin-only). */
export interface AdminUserListing {
  id: string;
  email: string;
  username: string | null;
  fullName: string | null;
  role: 'member' | 'admin';
  createdAt: string;
  /** Resolved quota (admin-assigned, or the default when hasCustomQuota is false). */
  storageQuotaBytes: number;
  hasCustomQuota: boolean;
  /** Total bytes stored across bands this user owns. */
  usedBytes: number;
  ownedBandCount: number;
}

/** Admin-only user listing and storage quota assignment, mounted at `/api/admin/users`. */
export interface AdminUsersClient {
  list(): Promise<AdminUserListing[]>;
  /** Sets a user's storage quota override; pass null to reset to the default. */
  setQuota(id: string, storageQuotaBytes: number | null): Promise<void>;
  /** Promotes or demotes a user's site-wide admin role. Unrelated to band ownership. */
  setRole(id: string, role: 'member' | 'admin'): Promise<void>;
  /** Permanently deletes a user, the bands they own, and every file those bands held. */
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
 * Band-scoped CRUD contract — every song/songlist/setlist/rider/press-kit is owned by a
 * band, so every list/create/update/remove call is namespaced under `bands/{bandId}/...`.
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

/**
 * PDF attachments on a band-owned song. Upload is storage-quota-gated upstream. Any band
 * member may upload; rename/remove are restricted server-side to the original uploader, not
 * gated by editor role (matches today's `storage.rules` behavior). `remove` moves to trash
 * (see `BandTrashClient`), not a hard delete.
 */
export interface BandAttachmentsClient {
  list(bandId: string, songId: string): Promise<SongAttachment[]>;
  upload(bandId: string, songId: string, file: File): Promise<SongAttachment>;
  rename(bandId: string, songId: string, attachmentId: string, name: string): Promise<void>;
  remove(bandId: string, songId: string, attachmentId: string): Promise<void>;
}

/**
 * Trash/restore for a band's resources (songs, songLists, setlists, attachments, technical
 * riders, press kits). 30-day retention; `list()` sweeps expired rows first. List requires
 * membership; mutations require editor role. Return shape (`Promise<string | null>` = error
 * message or null on success) matches `TrashView.tsx`'s
 * `onRestore`/`onDeletePermanently`/`onEmptyTrash` prop contract directly, so callers can pass
 * these methods straight through without adapting the shape.
 */
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
