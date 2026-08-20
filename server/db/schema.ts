import { pgTable, text, integer, timestamp, jsonb, boolean, primaryKey, check, unique } from 'drizzle-orm/pg-core';
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
