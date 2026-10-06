CREATE TABLE IF NOT EXISTS "calendar_feeds" (
	"token" text PRIMARY KEY NOT NULL,
	"band_id" text NOT NULL,
	"user_id" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calendar_feeds_status_check" CHECK ("calendar_feeds"."status" in ('active', 'revoked'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "gigs" (
	"id" text PRIMARY KEY NOT NULL,
	"band_id" text NOT NULL,
	"tour_id" text,
	"title" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"get_in_at" timestamp with time zone,
	"sound_check_at" timestamp with time zone,
	"timezone" text,
	"venue" text,
	"address" text,
	"contact_name" text,
	"contact_phone" text,
	"contact_email" text,
	"notes" text,
	"setlist_id" text,
	"press_kit_id" text,
	"rider_id" text,
	"status" text DEFAULT 'confirmed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gigs_status_check" CHECK ("gigs"."status" in ('confirmed', 'tentative', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tours" (
	"id" text PRIMARY KEY NOT NULL,
	"band_id" text NOT NULL,
	"name" text NOT NULL,
	"icon" text,
	"sort_order" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "press_kits" ADD COLUMN "gig_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "calendar_feeds" ADD CONSTRAINT "calendar_feeds_band_id_bands_id_fk" FOREIGN KEY ("band_id") REFERENCES "public"."bands"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "calendar_feeds" ADD CONSTRAINT "calendar_feeds_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "gigs" ADD CONSTRAINT "gigs_band_id_bands_id_fk" FOREIGN KEY ("band_id") REFERENCES "public"."bands"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "gigs" ADD CONSTRAINT "gigs_tour_id_tours_id_fk" FOREIGN KEY ("tour_id") REFERENCES "public"."tours"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "gigs" ADD CONSTRAINT "gigs_setlist_id_setlists_id_fk" FOREIGN KEY ("setlist_id") REFERENCES "public"."setlists"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "gigs" ADD CONSTRAINT "gigs_press_kit_id_press_kits_id_fk" FOREIGN KEY ("press_kit_id") REFERENCES "public"."press_kits"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "gigs" ADD CONSTRAINT "gigs_rider_id_band_riders_id_fk" FOREIGN KEY ("rider_id") REFERENCES "public"."band_riders"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tours" ADD CONSTRAINT "tours_band_id_bands_id_fk" FOREIGN KEY ("band_id") REFERENCES "public"."bands"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "calendar_feeds_one_active_idx" ON "calendar_feeds" USING btree ("band_id","user_id") WHERE "calendar_feeds"."status" = 'active';