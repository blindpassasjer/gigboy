CREATE TABLE IF NOT EXISTS "band_logos" (
	"id" text PRIMARY KEY NOT NULL,
	"band_id" text NOT NULL,
	"storage_key" text NOT NULL,
	"thumb_storage_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"thumb_size_bytes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "collaboration_invites" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"recipient_email" text NOT NULL,
	"recipient_email_lower" text NOT NULL,
	"recipient_user_id" text,
	"resource_type" text NOT NULL,
	"resource_id" text NOT NULL,
	"resource_name" text NOT NULL,
	"permission" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone,
	CONSTRAINT "collaboration_invites_resource_type_check" CHECK ("collaboration_invites"."resource_type" in ('song', 'songlist', 'setlist')),
	CONSTRAINT "collaboration_invites_permission_check" CHECK ("collaboration_invites"."permission" in ('viewer', 'editor')),
	CONSTRAINT "collaboration_invites_status_check" CHECK ("collaboration_invites"."status" in ('pending', 'accepted', 'declined', 'revoked'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"email" text,
	"message" text NOT NULL,
	"page" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hand_notes" (
	"id" text PRIMARY KEY NOT NULL,
	"song_id" text NOT NULL,
	"scope_type" text NOT NULL,
	"scope_owner_id" text NOT NULL,
	"author_user_id" text NOT NULL,
	"author_name" text,
	"author_avatar" text,
	"strokes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"text_notes" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hand_notes_song_author_unique" UNIQUE("song_id","author_user_id"),
	CONSTRAINT "hand_notes_scope_type_check" CHECK ("hand_notes"."scope_type" in ('user', 'band'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "song_recordings" (
	"id" text PRIMARY KEY NOT NULL,
	"song_id" text NOT NULL,
	"scope_type" text NOT NULL,
	"scope_owner_id" text NOT NULL,
	"name" text NOT NULL,
	"storage_key" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"mime_type" text NOT NULL,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"waveform_bars" jsonb,
	"recorder_user_id" text,
	"recorder_display_name" text,
	"recorder_avatar" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "song_recordings_scope_type_check" CHECK ("song_recordings"."scope_type" in ('user', 'band'))
);
--> statement-breakpoint
ALTER TABLE "setlists" ADD COLUMN "collaborator_ids" jsonb;--> statement-breakpoint
ALTER TABLE "setlists" ADD COLUMN "collaboration_permissions" jsonb;--> statement-breakpoint
ALTER TABLE "song_lists" ADD COLUMN "collaborator_ids" jsonb;--> statement-breakpoint
ALTER TABLE "song_lists" ADD COLUMN "collaboration_permissions" jsonb;--> statement-breakpoint
ALTER TABLE "songs" ADD COLUMN "collaborator_ids" jsonb;--> statement-breakpoint
ALTER TABLE "songs" ADD COLUMN "collaboration_permissions" jsonb;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "band_logos" ADD CONSTRAINT "band_logos_band_id_bands_id_fk" FOREIGN KEY ("band_id") REFERENCES "public"."bands"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "band_logos" ADD CONSTRAINT "band_logos_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "collaboration_invites" ADD CONSTRAINT "collaboration_invites_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "collaboration_invites" ADD CONSTRAINT "collaboration_invites_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "feedback" ADD CONSTRAINT "feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "hand_notes" ADD CONSTRAINT "hand_notes_song_id_songs_id_fk" FOREIGN KEY ("song_id") REFERENCES "public"."songs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "hand_notes" ADD CONSTRAINT "hand_notes_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "song_recordings" ADD CONSTRAINT "song_recordings_song_id_songs_id_fk" FOREIGN KEY ("song_id") REFERENCES "public"."songs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "song_recordings" ADD CONSTRAINT "song_recordings_recorder_user_id_users_id_fk" FOREIGN KEY ("recorder_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
