CREATE TABLE IF NOT EXISTS "setlist_sessions" (
	"setlist_id" text PRIMARY KEY NOT NULL,
	"band_id" text NOT NULL,
	"song_index" integer DEFAULT 0 NOT NULL,
	"page_index" integer DEFAULT 0 NOT NULL,
	"transpose" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "setlist_sessions" ADD CONSTRAINT "setlist_sessions_setlist_id_setlists_id_fk" FOREIGN KEY ("setlist_id") REFERENCES "public"."setlists"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "setlist_sessions" ADD CONSTRAINT "setlist_sessions_band_id_bands_id_fk" FOREIGN KEY ("band_id") REFERENCES "public"."bands"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
