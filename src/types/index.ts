export interface SongListCategory {
  id: string;
  name: string;
  sortOrder?: number;
}

export type PlanTier = 'free' | 'pro' | 'crew';
export type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'canceled' | 'unpaid' | 'incomplete' | null;

export type CollaborationPermission = 'viewer' | 'editor';
export type CollaborationRole = 'owner' | CollaborationPermission;

export type ShareResourceType = 'song' | 'songlist' | 'setlist';

export interface CollaborationMetadata {
  ownerId?: string;
  collaboratorIds?: string[];
  collaborationPermissions?: Record<string, CollaborationPermission>;
  accessRole?: CollaborationRole;
}

export interface CollaborationInvite {
  id: string;
  ownerId: string;
  ownerEmail: string;
  ownerFullName?: string;
  recipientUsername?: string;
  recipientUsernameLower?: string;
  recipientEmail: string;
  recipientEmailLower: string;
  recipientUid?: string;
  resourceType: ShareResourceType;
  resourceId: string;
  resourceName: string;
  permission: CollaborationPermission;
  status: 'pending' | 'accepted' | 'declined' | 'revoked';
  createdAt: string;
  respondedAt?: string;
}

export interface Band {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  logo?: string;
  logoStoragePath?: string;
  ownerId: string;
  memberIds: string[];
  memberRoles: Record<string, CollaborationPermission>;
  memberEmails: Record<string, string>;
  memberUsernames: Record<string, string>;
  memberFullNames: Record<string, string>;
  memberAvatars: Record<string, string>;
  billingPlan?: 'free' | 'pro' | 'crew';
  billingSubscriptionStatus?: SubscriptionStatus;
  billingCurrentPeriodEnd?: number | null;
  billingExtraMembers?: number;
  billingMemberLimit?: number;
  stripeSubscriptionId?: string;
  stripeBandItemId?: string;
  stripeExtraMembersItemId?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface BandInvite {
  id: string;
  bandId: string;
  bandName: string;
  inviterId: string;
  inviterEmail: string;
  recipientUsername?: string;
  recipientUsernameLower?: string;
  recipientEmail: string;
  recipientEmailLower: string;
  recipientUid?: string;
  role: CollaborationPermission;
  status: 'pending' | 'accepted' | 'declined' | 'revoked';
  createdAt: string;
  respondedAt?: string;
}

export interface SongList extends CollaborationMetadata {
  id: string;
  name: string;
  songIds: string[];
  folderId?: string;
  icon?: string;
  sortOrder?: number;
}

export interface PublicSongEntry {
  id: string;
  title: string;
  artist?: string;
}

export interface PublicSetlistSongEntry extends PublicSongEntry {
  note?: string;
}

export interface Setlist extends CollaborationMetadata {
  id: string;
  name: string;
  icon?: string;
  songIds: string[];
  /** Optional note keyed by song ID for setlist-specific performance cues. */
  songNotes?: Record<string, string>;
  publicShareEnabled?: boolean;
  /** Denormalized song titles/artists for unauthenticated public reads. */
  publicSongs?: PublicSongEntry[];
  /** Denormalized setlist notes for unauthenticated public reads. */
  publicSongNotes?: Record<string, string>;
  /** Band name denormalized into the setlist for unauthenticated public reads. */
  bandName?: string;
  createdAt?: string;
  updatedAt?: string;
  sortOrder?: number;
}

export interface StageplotItem {
  id: string;
  kind: string;
  label: string;
  x: number;
  y: number;
  rotation?: number;
  color?: string;
  icon?: string;
}

export interface Stageplot extends CollaborationMetadata {
  id: string;
  name: string;
  icon?: string;
  items: StageplotItem[];
  drawingLayers?: SongHandNoteDocument[];
  publicShareEnabled?: boolean;
  stageShape?: 'rectangle' | 'oval' | 'circle';
  stageSize?: 'small' | 'medium' | 'large';
  /** Band name denormalized for unauthenticated public reads. */
  bandName?: string;
  createdAt?: string;
  updatedAt?: string;
  sortOrder?: number;
}

export interface InputListLine {
  id: string;
  name: string;
  description: string;
  sortOrder?: number;
}

export interface RiderEquipmentItem {
  id: string;
  name: string;
  description?: string;
  sortOrder?: number;
}

export interface InputList extends CollaborationMetadata {
  id: string;
  name: string;
  icon?: string;
  lines: InputListLine[];
  preferredEquipment: RiderEquipmentItem[];
  inventoryEquipment: RiderEquipmentItem[];
  /** Stageplot canvas items embedded in this technical rider. */
  items?: StageplotItem[];
  /** Stageplot freehand drawing layers embedded in this technical rider. */
  drawingLayers?: SongHandNoteDocument[];
  stageShape?: 'rectangle' | 'oval' | 'circle';
  stageSize?: 'small' | 'medium' | 'large';
  publicShareEnabled?: boolean;
  /** Band name denormalized for unauthenticated public reads. */
  bandName?: string;
  createdAt?: string;
  updatedAt?: string;
  sortOrder?: number;
}

export type TrashItemType = 'song' | 'songlist' | 'setlist' | 'technicalRider' | 'pressKit' | 'pressKitImage' | 'bandLogo';

export interface PressKit {
  id: string;
  name: string;
  icon?: string;
  richText: string;
  imageIds: string[];
  /** Video URLs (YouTube, Vimeo, VEVO, Spotify) to embed in the public press kit. */
  videoUrls?: string[];
  /** Selected video URLs to include in shared public press-kit links. */
  selectedVideoUrls?: string[];
  createdAt?: string;
}

export interface TrashMetadata {
  trashId: string;
  deletedAt: string;
  purgeAt: string;
}

export interface TrashedSong extends TrashMetadata {
  itemType: 'song';
  song: Song;
}

export interface TrashedSongList extends TrashMetadata {
  itemType: 'songlist';
  songList: SongList;
}

export interface TrashedSetlist extends TrashMetadata {
  itemType: 'setlist';
  setlist: Setlist;
}

export interface TrashedInputList extends TrashMetadata {
  itemType: 'technicalRider';
  inputList: InputList;
}

export interface TrashedPressKit extends TrashMetadata {
  itemType: 'pressKit';
  pressKit: PressKit;
}

export interface TrashedPressKitImage extends TrashMetadata {
  itemType: 'pressKitImage';
  image: {
    id: string;
    title: string;
    url: string;
    thumbUrl?: string;
    storagePath?: string;
    thumbStoragePath?: string;
    mimeType?: string;
    sizeBytes?: number;
    thumbSizeBytes?: number;
    createdAt?: string;
    createdBy?: string;
  };
  linkedPressKitIds?: string[];
}

export interface TrashedBandLogo extends TrashMetadata {
  itemType: 'bandLogo';
  image: {
    id: 'band-logo';
    title: string;
    url: string;
    thumbUrl?: string;
    storagePath?: string;
    thumbStoragePath?: string;
    mimeType?: string;
    sizeBytes?: number;
    thumbSizeBytes?: number;
    createdAt?: string;
    createdBy?: string;
  };
  linkedPressKitIds?: string[];
}

export type Language =
  | 'en'
  | 'es'
  | 'no'
  | 'pt'
  | 'fr'
  | 'de'
  | 'it'
  | 'la'
  | string;

export interface Song extends CollaborationMetadata {
  id: string;
  title: string;
  artist?: string;
  author?: string;
  /** Optional playback URL from YouTube or Spotify. */
  playbackUrl?: string;
  language: Language;
  /** Additional languages present in the song (e.g. bilingual) */
  secondaryLanguages?: Language[];
  tags?: string[];
  /** ChordPro-formatted lyrics. Chords wrapped in [brackets]. */
  chordpro: string;
  capo?: number;
  key?: string;
  /** Persisted semitone offset that should be applied when opening the song. */
  preferredTranspose?: number;
  tempo?: number;
  timeSignature?: string;
  sortOrder?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface HandNoteStroke {
  id: string;
  color: string;
  /** Stroke width in logical pixels, relative to the viewport width used when drawing. */
  width: number;
  /**
   * Normalized points [x0, y0, x1, y1, ...].
   * v1 (default): x = clientX/viewportWidth ∈ [0,1], y = clientY/viewportHeight ∈ [0,1]
   * v2: both x and y are divided by viewportWidth, so y can exceed 1 on tall canvases.
   *     This preserves the aspect ratio of handwriting across different screen sizes.
   */
  points: number[];
  createdAt: string;
}

export interface SongHandNoteDocument {
  authorUid: string;
  authorName?: string | null;
  authorAvatar?: string | null;
  updatedAt: string;
  viewport: {
    width: number;
    height: number;
  };
  /**
   * Coordinate system used for stroke points.
   * Absent / 'v1': legacy — y is normalised by viewport height.
   * 'v2': both x and y are normalised by viewport width — aspect ratio is preserved but
   *        notes drift when viewed on a screen with a different width.
   * 'v3': x normalised by viewport width, y normalised by viewport height — notes stay
   *        at the correct fractional position in the content on any screen size.
   */
  coordinateSystem?: 'v2' | 'v3';
  strokes: HandNoteStroke[];
}

export interface SongHandNoteAuthor {
  uid: string;
  name: string;
  avatar?: string | null;
}

export interface ParsedLine {
  type: 'chord-lyric' | 'directive' | 'comment' | 'empty' | 'tab' | 'section';
  segments?: ChordSegment[];
  /** Directive name (e.g. "title", "chorus") */
  directive?: string;
  directiveValue?: string;
  raw: string;
  /** Lines inside a {start_of_tab}...{end_of_tab} block (only present when type === 'tab') */
  tabLines?: string[];
  /** Section name, e.g. "verse", "chorus" (only present when type === 'section') */
  sectionType?: string;
  /** Content lines nested inside a section block (only present when type === 'section') */
  sectionLines?: ParsedLine[];
}

export interface ChordSegment {
  chord: string;
  lyric: string;
}
