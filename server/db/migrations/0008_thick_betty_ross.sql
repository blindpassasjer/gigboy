ALTER TABLE "collaboration_invites" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "collaboration_invites" CASCADE;--> statement-breakpoint
ALTER TABLE "hand_notes" DROP CONSTRAINT "hand_notes_scope_type_check";--> statement-breakpoint
ALTER TABLE "setlists" DROP CONSTRAINT "setlists_owner_check";--> statement-breakpoint
ALTER TABLE "song_lists" DROP CONSTRAINT "song_lists_owner_check";--> statement-breakpoint
ALTER TABLE "song_recordings" DROP CONSTRAINT "song_recordings_scope_type_check";--> statement-breakpoint
ALTER TABLE "songs" DROP CONSTRAINT "songs_owner_check";--> statement-breakpoint
ALTER TABLE "trash_items" DROP CONSTRAINT "trash_items_owner_check";--> statement-breakpoint
ALTER TABLE "setlists" DROP CONSTRAINT "setlists_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "song_lists" DROP CONSTRAINT "song_lists_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "songs" DROP CONSTRAINT "songs_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "trash_items" DROP CONSTRAINT "trash_items_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "setlists" ALTER COLUMN "band_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "song_lists" ALTER COLUMN "band_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "songs" ALTER COLUMN "band_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "trash_items" ALTER COLUMN "band_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "hand_notes" ADD COLUMN "band_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "song_recordings" ADD COLUMN "band_id" text NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "hand_notes" ADD CONSTRAINT "hand_notes_band_id_bands_id_fk" FOREIGN KEY ("band_id") REFERENCES "public"."bands"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "song_recordings" ADD CONSTRAINT "song_recordings_band_id_bands_id_fk" FOREIGN KEY ("band_id") REFERENCES "public"."bands"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "hand_notes" DROP COLUMN IF EXISTS "scope_type";--> statement-breakpoint
ALTER TABLE "hand_notes" DROP COLUMN IF EXISTS "scope_owner_id";--> statement-breakpoint
ALTER TABLE "setlists" DROP COLUMN IF EXISTS "user_id";--> statement-breakpoint
ALTER TABLE "setlists" DROP COLUMN IF EXISTS "collaborator_ids";--> statement-breakpoint
ALTER TABLE "setlists" DROP COLUMN IF EXISTS "collaboration_permissions";--> statement-breakpoint
ALTER TABLE "song_lists" DROP COLUMN IF EXISTS "user_id";--> statement-breakpoint
ALTER TABLE "song_lists" DROP COLUMN IF EXISTS "collaborator_ids";--> statement-breakpoint
ALTER TABLE "song_lists" DROP COLUMN IF EXISTS "collaboration_permissions";--> statement-breakpoint
ALTER TABLE "song_recordings" DROP COLUMN IF EXISTS "scope_type";--> statement-breakpoint
ALTER TABLE "song_recordings" DROP COLUMN IF EXISTS "scope_owner_id";--> statement-breakpoint
ALTER TABLE "songs" DROP COLUMN IF EXISTS "user_id";--> statement-breakpoint
ALTER TABLE "songs" DROP COLUMN IF EXISTS "collaborator_ids";--> statement-breakpoint
ALTER TABLE "songs" DROP COLUMN IF EXISTS "collaboration_permissions";--> statement-breakpoint
ALTER TABLE "trash_items" DROP COLUMN IF EXISTS "user_id";