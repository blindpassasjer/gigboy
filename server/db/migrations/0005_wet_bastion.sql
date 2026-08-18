CREATE TABLE IF NOT EXISTS "press_kit_images" (
	"id" text PRIMARY KEY NOT NULL,
	"band_id" text NOT NULL,
	"title" text NOT NULL,
	"storage_key" text NOT NULL,
	"thumb_storage_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"thumb_size_bytes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "press_kit_shares" (
	"token" text PRIMARY KEY NOT NULL,
	"band_id" text NOT NULL,
	"kit_id" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "press_kit_shares_status_check" CHECK ("press_kit_shares"."status" in ('active', 'revoked'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "press_kits" (
	"id" text PRIMARY KEY NOT NULL,
	"band_id" text NOT NULL,
	"name" text NOT NULL,
	"icon" text,
	"rich_text" text DEFAULT '' NOT NULL,
	"image_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"video_urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"selected_video_urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"presave_release_name" text,
	"presave_release_date" text,
	"presave_urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"selected_presave_urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "press_kit_images" ADD CONSTRAINT "press_kit_images_band_id_bands_id_fk" FOREIGN KEY ("band_id") REFERENCES "public"."bands"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "press_kit_images" ADD CONSTRAINT "press_kit_images_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "press_kit_shares" ADD CONSTRAINT "press_kit_shares_band_id_bands_id_fk" FOREIGN KEY ("band_id") REFERENCES "public"."bands"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "press_kit_shares" ADD CONSTRAINT "press_kit_shares_kit_id_press_kits_id_fk" FOREIGN KEY ("kit_id") REFERENCES "public"."press_kits"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "press_kit_shares" ADD CONSTRAINT "press_kit_shares_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "press_kits" ADD CONSTRAINT "press_kits_band_id_bands_id_fk" FOREIGN KEY ("band_id") REFERENCES "public"."bands"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "press_kits" ADD CONSTRAINT "press_kits_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
