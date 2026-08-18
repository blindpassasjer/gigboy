CREATE TABLE IF NOT EXISTS "trash_items" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"band_id" text,
	"item_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"deleted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"purge_at" timestamp with time zone NOT NULL,
	CONSTRAINT "trash_items_owner_check" CHECK (num_nonnulls("trash_items"."user_id", "trash_items"."band_id") = 1)
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trash_items" ADD CONSTRAINT "trash_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trash_items" ADD CONSTRAINT "trash_items_band_id_bands_id_fk" FOREIGN KEY ("band_id") REFERENCES "public"."bands"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
