export interface SongListCategory {
  id: string;
  name: string;
  sortOrder?: number;
}

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
  ownerId: string;
  memberIds: string[];
  memberRoles: Record<string, CollaborationPermission>;
  memberEmails: Record<string, string>;
  memberUsernames: Record<string, string>;
  memberFullNames: Record<string, string>;
  memberAvatars: Record<string, string>;
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

export interface Setlist extends CollaborationMetadata {
  id: string;
  name: string;
  icon?: string;
  songIds: string[];
  createdAt?: string;
  updatedAt?: string;
  sortOrder?: number;
}

export type TrashItemType = 'song' | 'songlist' | 'setlist';

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
  tempo?: number;
  timeSignature?: string;
  sortOrder?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface HandNoteStroke {
  id: string;
  color: string;
  width: number;
  /** Normalized points [x0, y0, x1, y1, ...] in 0..1 space */
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
  strokes: HandNoteStroke[];
}

export interface SongHandNoteAuthor {
  uid: string;
  name: string;
  avatar?: string | null;
}

export interface ParsedLine {
  type: 'chord-lyric' | 'directive' | 'comment' | 'empty' | 'tab';
  segments?: ChordSegment[];
  /** Directive name (e.g. "title", "chorus") */
  directive?: string;
  directiveValue?: string;
  raw: string;
  /** Lines inside a {start_of_tab}...{end_of_tab} block (only present when type === 'tab') */
  tabLines?: string[];
}

export interface ChordSegment {
  chord: string;
  lyric: string;
}
