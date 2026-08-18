CREATE TABLE IF NOT EXISTS "band_invites" (
	"id" text PRIMARY KEY NOT NULL,
	"band_id" text NOT NULL,
	"inviter_id" text NOT NULL,
	"role" text DEFAULT 'editor' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "band_invites_status_check" CHECK ("band_invites"."status" in ('pending', 'revoked'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "band_members" (
	"band_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'editor' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "band_members_band_id_user_id_pk" PRIMARY KEY("band_id","user_id"),
	CONSTRAINT "band_members_role_check" CHECK ("band_members"."role" in ('editor', 'viewer'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bands" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"icon" text,
	"owner_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "setlists" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "song_lists" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "songs" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "setlists" ADD COLUMN "band_id" text;--> statement-breakpoint
ALTER TABLE "song_lists" ADD COLUMN "band_id" text;--> statement-breakpoint
ALTER TABLE "songs" ADD COLUMN "band_id" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "band_invites" ADD CONSTRAINT "band_invites_band_id_bands_id_fk" FOREIGN KEY ("band_id") REFERENCES "public"."bands"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "band_invites" ADD CONSTRAINT "band_invites_inviter_id_users_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "band_members" ADD CONSTRAINT "band_members_band_id_bands_id_fk" FOREIGN KEY ("band_id") REFERENCES "public"."bands"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "band_members" ADD CONSTRAINT "band_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bands" ADD CONSTRAINT "bands_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "setlists" ADD CONSTRAINT "setlists_band_id_bands_id_fk" FOREIGN KEY ("band_id") REFERENCES "public"."bands"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "song_lists" ADD CONSTRAINT "song_lists_band_id_bands_id_fk" FOREIGN KEY ("band_id") REFERENCES "public"."bands"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "songs" ADD CONSTRAINT "songs_band_id_bands_id_fk" FOREIGN KEY ("band_id") REFERENCES "public"."bands"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "setlists" ADD CONSTRAINT "setlists_owner_check" CHECK (num_nonnulls("setlists"."user_id", "setlists"."band_id") = 1);--> statement-breakpoint
ALTER TABLE "song_lists" ADD CONSTRAINT "song_lists_owner_check" CHECK (num_nonnulls("song_lists"."user_id", "song_lists"."band_id") = 1);--> statement-breakpoint
ALTER TABLE "songs" ADD CONSTRAINT "songs_owner_check" CHECK (num_nonnulls("songs"."user_id", "songs"."band_id") = 1);