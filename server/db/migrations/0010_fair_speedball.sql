CREATE TABLE IF NOT EXISTS "song_member_prefs" (
	"song_id" text NOT NULL,
	"user_id" text NOT NULL,
	"band_id" text NOT NULL,
	"transpose" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "song_member_prefs_song_id_user_id_pk" PRIMARY KEY("song_id","user_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "song_member_prefs" ADD CONSTRAINT "song_member_prefs_song_id_songs_id_fk" FOREIGN KEY ("song_id") REFERENCES "public"."songs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "song_member_prefs" ADD CONSTRAINT "song_member_prefs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "song_member_prefs" ADD CONSTRAINT "song_member_prefs_band_id_bands_id_fk" FOREIGN KEY ("band_id") REFERENCES "public"."bands"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
