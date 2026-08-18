CREATE TABLE IF NOT EXISTS "band_riders" (
	"id" text PRIMARY KEY NOT NULL,
	"band_id" text NOT NULL,
	"name" text NOT NULL,
	"icon" text,
	"hospitality_notes" text,
	"logistics_notes" text,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"drawing_layers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"public_share_enabled" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bands" ADD COLUMN "logo" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "band_riders" ADD CONSTRAINT "band_riders_band_id_bands_id_fk" FOREIGN KEY ("band_id") REFERENCES "public"."bands"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
