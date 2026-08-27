CREATE TABLE IF NOT EXISTS "recording_comments" (
	"id" text PRIMARY KEY NOT NULL,
	"recording_id" text NOT NULL,
	"song_id" text NOT NULL,
	"band_id" text NOT NULL,
	"author_user_id" text,
	"author_display_name" text,
	"author_avatar" text,
	"at_ms" integer,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "recording_comments" ADD CONSTRAINT "recording_comments_recording_id_song_recordings_id_fk" FOREIGN KEY ("recording_id") REFERENCES "public"."song_recordings"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "recording_comments" ADD CONSTRAINT "recording_comments_song_id_songs_id_fk" FOREIGN KEY ("song_id") REFERENCES "public"."songs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "recording_comments" ADD CONSTRAINT "recording_comments_band_id_bands_id_fk" FOREIGN KEY ("band_id") REFERENCES "public"."bands"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "recording_comments" ADD CONSTRAINT "recording_comments_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
