CREATE TABLE IF NOT EXISTS "band_chord_voicings" (
	"id" text PRIMARY KEY NOT NULL,
	"band_id" text NOT NULL,
	"instrument" text NOT NULL,
	"chord_name" text NOT NULL,
	"frets" jsonb NOT NULL,
	"created_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "band_chord_voicings_band_instrument_chord_unique" UNIQUE("band_id","instrument","chord_name"),
	CONSTRAINT "band_chord_voicings_instrument_check" CHECK ("band_chord_voicings"."instrument" in ('guitar', 'ukulele'))
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "band_chord_voicings" ADD CONSTRAINT "band_chord_voicings_band_id_bands_id_fk" FOREIGN KEY ("band_id") REFERENCES "public"."bands"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "band_chord_voicings" ADD CONSTRAINT "band_chord_voicings_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
