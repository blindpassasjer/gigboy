import { pgTable, text, integer, bigint, timestamp, jsonb, boolean, primaryKey, check, unique } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const users = pgTable(
  'users',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull().unique(),
    emailLower: text('email_lower').notNull().unique(),
    username: text('username').notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    avatar: text('avatar'),
    fullName: text('full_name'),
    role: text('role').notNull().default('member'),
    // Admin-assigned storage cap for this user's uploads. Null means "use the default"
    // (see DEFAULT_STORAGE_QUOTA_BYTES in server/lib/storageQuota.ts). bigint, not integer —
    // quota values in bytes (e.g. 5GB = 5368709120) exceed Postgres's int32 range.
    storageQuotaBytes: bigint('storage_quota_bytes', { mode: 'number' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [check('users_role_check', sql`${table.role} in ('member', 'admin')`)],
);

export const sessions = pgTable('sessions', {
  token: text('token').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const bands = pgTable('bands', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  icon: text('icon'),
  logo: text('logo'),
  ownerId: text('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const bandMembers = pgTable(
  'band_members',
  {
    bandId: text('band_id').notNull().references(() => bands.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').notNull().default('editor'),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.bandId, table.userId] }),
    check('band_members_role_check', sql`${table.role} in ('editor', 'viewer')`),
  ],
);

export const bandInvites = pgTable('band_invites', {
  id: text('id').primaryKey(),
  bandId: text('band_id').notNull().references(() => bands.id, { onDelete: 'cascade' }),
  inviterId: text('inviter_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: text('role').notNull().default('editor'),
  status: text('status').notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
}, (table) => [
  check('band_invites_status_check', sql`${table.status} in ('pending', 'revoked')`),
]);

export const userInvites = pgTable('user_invites', {
  id: text('id').primaryKey(),
  inviterId: text('inviter_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  email: text('email'),
  role: text('role').notNull().default('member'),
  status: text('status').notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  acceptedUserId: text('accepted_user_id').references(() => users.id, { onDelete: 'set null' }),
}, (table) => [
  check('user_invites_status_check', sql`${table.status} in ('pending', 'revoked', 'accepted')`),
]);

export const songs = pgTable(
  'songs',
  {
    id: text('id').primaryKey(),
    bandId: text('band_id').notNull().references(() => bands.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    artist: text('artist'),
    author: text('author'),
    playbackUrl: text('playback_url'),
    language: text('language').notNull(),
    secondaryLanguages: jsonb('secondary_languages').$type<string[]>(),
    tags: jsonb('tags').$type<string[]>(),
    chordpro: text('chordpro').notNull(),
    capo: integer('capo'),
    key: text('key'),
    preferredTranspose: integer('preferred_transpose'),
    tempo: integer('tempo'),
    timeSignature: text('time_signature'),
    sortOrder: integer('sort_order'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
);

/**
 * Per-member overrides for a song. Today just a personal transpose offset (e.g. a horn
 * player reading in a different key than the shared chart's `songs.preferred_transpose`).
 * One row per (song, user); absence means "use the band default".
 */
export const songMemberPrefs = pgTable(
  'song_member_prefs',
  {
    songId: text('song_id').notNull().references(() => songs.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    bandId: text('band_id').notNull().references(() => bands.id, { onDelete: 'cascade' }),
    transpose: integer('transpose').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.songId, table.userId] })],
);

/**
 * Append-only edit history for a song. Each row is a full snapshot of the editable fields
 * as they stood after a save. Newest row = current state. Rapid successive saves by the
 * same editor are coalesced (see server/lib/songRevisions.ts) and the list is capped per
 * song, so this stays text-only and small.
 */
export const songRevisions = pgTable(
  'song_revisions',
  {
    id: text('id').primaryKey(),
    songId: text('song_id').notNull().references(() => songs.id, { onDelete: 'cascade' }),
    bandId: text('band_id').notNull().references(() => bands.id, { onDelete: 'cascade' }),
    editorUserId: text('editor_user_id').references(() => users.id, { onDelete: 'set null' }),
    editorDisplayName: text('editor_display_name'),
    editorAvatar: text('editor_avatar'),
    snapshot: jsonb('snapshot').$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
);

export const songLists = pgTable(
  'song_lists',
  {
    id: text('id').primaryKey(),
    bandId: text('band_id').notNull().references(() => bands.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    songIds: jsonb('song_ids').$type<string[]>().notNull().default([]),
    folderId: text('folder_id'),
    icon: text('icon'),
    sortOrder: integer('sort_order'),
  },
);

export const setlists = pgTable(
  'setlists',
  {
    id: text('id').primaryKey(),
    bandId: text('band_id').notNull().references(() => bands.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    icon: text('icon'),
    songIds: jsonb('song_ids').$type<string[]>().notNull().default([]),
    songNotes: jsonb('song_notes').$type<Record<string, string>>(),
    sortOrder: integer('sort_order'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
);

/** One hand-drawn/typed note document per (song, author) — mirrors src/lib/songHandNotes.ts's Firestore shape. */
export const handNotes = pgTable(
  'hand_notes',
  {
    id: text('id').primaryKey(),
    songId: text('song_id').notNull().references(() => songs.id, { onDelete: 'cascade' }),
    bandId: text('band_id').notNull().references(() => bands.id, { onDelete: 'cascade' }),
    authorUserId: text('author_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    authorName: text('author_name'),
    authorAvatar: text('author_avatar'),
    strokes: jsonb('strokes').$type<unknown[]>().notNull().default([]),
    textNotes: jsonb('text_notes').$type<unknown[]>(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('hand_notes_song_author_unique').on(table.songId, table.authorUserId),
  ],
);

/** Voice-memo style recordings attached to a song — mirrors src/lib/songRecordings.ts's Firestore + Storage shape. */
export const songRecordings = pgTable(
  'song_recordings',
  {
    id: text('id').primaryKey(),
    songId: text('song_id').notNull().references(() => songs.id, { onDelete: 'cascade' }),
    bandId: text('band_id').notNull().references(() => bands.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    storageKey: text('storage_key').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    mimeType: text('mime_type').notNull(),
    durationMs: integer('duration_ms').notNull().default(0),
    waveformBars: jsonb('waveform_bars').$type<number[]>(),
    recorderUserId: text('recorder_user_id').references(() => users.id, { onDelete: 'set null' }),
    recorderDisplayName: text('recorder_display_name'),
    recorderAvatar: text('recorder_avatar'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
);

/**
 * Per-band chord voicing overrides — the fingering a band actually plays for a given chord
 * name, replacing the built-in diagram in `src/data/{guitar,ukulele}Chords.ts` (and filling
 * gaps where there's no built-in). `frets` uses the same shape as those tables: one entry
 * per string, `-1` muted, `0` open, otherwise the fret number.
 */
export const bandChordVoicings = pgTable(
  'band_chord_voicings',
  {
    id: text('id').primaryKey(),
    bandId: text('band_id').notNull().references(() => bands.id, { onDelete: 'cascade' }),
    instrument: text('instrument').notNull(),
    chordName: text('chord_name').notNull(),
    frets: jsonb('frets').$type<number[]>().notNull(),
    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('band_chord_voicings_band_instrument_chord_unique').on(table.bandId, table.instrument, table.chordName),
    check('band_chord_voicings_instrument_check', sql`${table.instrument} in ('guitar', 'ukulele')`),
  ],
);

/**
 * Comments on a song recording — either a general note (`atMs` null) or one pinned to a
 * moment in the take (`atMs` set). Any band member can post; edit/delete is author-only
 * (or a band editor). `songId`/`bandId` are denormalized for cheap auth scoping.
 */
export const recordingComments = pgTable(
  'recording_comments',
  {
    id: text('id').primaryKey(),
    recordingId: text('recording_id').notNull().references(() => songRecordings.id, { onDelete: 'cascade' }),
    songId: text('song_id').notNull().references(() => songs.id, { onDelete: 'cascade' }),
    bandId: text('band_id').notNull().references(() => bands.id, { onDelete: 'cascade' }),
    authorUserId: text('author_user_id').references(() => users.id, { onDelete: 'set null' }),
    authorDisplayName: text('author_display_name'),
    authorAvatar: text('author_avatar'),
    atMs: integer('at_ms'),
    body: text('body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
);

export const attachments = pgTable('attachments', {
  id: text('id').primaryKey(),
  songId: text('song_id').notNull().references(() => songs.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  storageKey: text('storage_key').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  mimeType: text('mime_type').notNull().default('application/pdf'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  uploaderUserId: text('uploader_user_id').references(() => users.id, { onDelete: 'set null' }),
  uploaderDisplayName: text('uploader_display_name'),
  uploaderAvatar: text('uploader_avatar'),
});

export const trashItems = pgTable(
  'trash_items',
  {
    id: text('id').primaryKey(),
    bandId: text('band_id').notNull().references(() => bands.id, { onDelete: 'cascade' }),
    itemType: text('item_type').notNull(),
    payload: jsonb('payload').notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }).notNull().defaultNow(),
    purgeAt: timestamp('purge_at', { withTimezone: true }).notNull(),
  },
);

/**
 * Ephemeral "now playing" state for a live setlist run — one row per setlist. The host's
 * Concert Mode pushes song/page/transpose here; followers' screens read it. Only the
 * position fields matter; the live subscriber list + current host are tracked in-process
 * (see server/routes/setlistSessions.ts), not here.
 */
export const setlistSessions = pgTable('setlist_sessions', {
  setlistId: text('setlist_id').primaryKey().references(() => setlists.id, { onDelete: 'cascade' }),
  bandId: text('band_id').notNull().references(() => bands.id, { onDelete: 'cascade' }),
  songIndex: integer('song_index').notNull().default(0),
  pageIndex: integer('page_index').notNull().default(0),
  transpose: integer('transpose').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const bandRiders = pgTable('band_riders', {
  id: text('id').primaryKey(),
  bandId: text('band_id').notNull().references(() => bands.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  icon: text('icon'),
  hospitalityNotes: text('hospitality_notes'),
  logisticsNotes: text('logistics_notes'),
  items: jsonb('items').$type<unknown[]>().notNull().default([]),
  drawingLayers: jsonb('drawing_layers').$type<unknown[]>().notNull().default([]),
  publicShareEnabled: boolean('public_share_enabled').notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const pressKits = pgTable('press_kits', {
  id: text('id').primaryKey(),
  bandId: text('band_id').notNull().references(() => bands.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  icon: text('icon'),
  richText: text('rich_text').notNull().default(''),
  imageIds: jsonb('image_ids').$type<string[]>().notNull().default([]),
  videoUrls: jsonb('video_urls').$type<string[]>().notNull().default([]),
  selectedVideoUrls: jsonb('selected_video_urls').$type<string[]>().notNull().default([]),
  presaveReleaseName: text('presave_release_name'),
  presaveReleaseDate: text('presave_release_date'),
  presaveUrls: jsonb('presave_urls').$type<string[]>().notNull().default([]),
  selectedPresaveUrls: jsonb('selected_presave_urls').$type<string[]>().notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
});

export const pressKitImages = pgTable('press_kit_images', {
  id: text('id').primaryKey(),
  bandId: text('band_id').notNull().references(() => bands.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  storageKey: text('storage_key').notNull(),
  thumbStorageKey: text('thumb_storage_key').notNull(),
  mimeType: text('mime_type').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  thumbSizeBytes: integer('thumb_size_bytes').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
});

export const pressKitShares = pgTable(
  'press_kit_shares',
  {
    token: text('token').primaryKey(),
    bandId: text('band_id').notNull().references(() => bands.id, { onDelete: 'cascade' }),
    kitId: text('kit_id').notNull().references(() => pressKits.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('active'),
    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [check('press_kit_shares_status_check', sql`${table.status} in ('active', 'revoked')`)],
);

/** Band logo asset library — clones press_kit_images' shape. bands.logo stores the selected asset's servable URL. */
export const bandLogos = pgTable('band_logos', {
  id: text('id').primaryKey(),
  bandId: text('band_id').notNull().references(() => bands.id, { onDelete: 'cascade' }),
  storageKey: text('storage_key').notNull(),
  thumbStorageKey: text('thumb_storage_key').notNull(),
  mimeType: text('mime_type').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  thumbSizeBytes: integer('thumb_size_bytes').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
});

export const feedback = pgTable('feedback', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
  email: text('email'),
  message: text('message').notNull(),
  page: text('page'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
