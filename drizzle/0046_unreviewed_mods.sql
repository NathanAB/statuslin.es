CREATE TABLE "unreviewed_mods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner" text NOT NULL,
	"plugin_name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"repo_url" text NOT NULL,
	"path" text DEFAULT '' NOT NULL,
	"commit_sha" text NOT NULL,
	"committed_at" timestamp with time zone NOT NULL,
	"plugin_version" text,
	"license" text,
	"stars" integer NOT NULL,
	"footprint" jsonb NOT NULL,
	"validated_with" text NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "unreviewed_mods_owner_check" CHECK ("unreviewed_mods"."owner" ~ '^[A-Za-z0-9-]+$'),
	CONSTRAINT "unreviewed_mods_plugin_name_check" CHECK ("unreviewed_mods"."plugin_name" ~ '^[A-Za-z0-9][A-Za-z0-9._-]*$'),
	CONSTRAINT "unreviewed_mods_repo_url_check" CHECK ("unreviewed_mods"."repo_url" ~ '^https://github\.com/[A-Za-z0-9-]+/[A-Za-z0-9._-]+$' AND "unreviewed_mods"."repo_url" !~* '(\.git|/\.{1,2})$'),
	CONSTRAINT "unreviewed_mods_path_check" CHECK ("unreviewed_mods"."path" ~ '^([A-Za-z0-9._-]+(/[A-Za-z0-9._-]+)*)?$' AND "unreviewed_mods"."path" !~ '(^|/)\.{1,2}(/|$)'),
	CONSTRAINT "unreviewed_mods_commit_sha_check" CHECK ("unreviewed_mods"."commit_sha" ~ '^[0-9a-f]{40}$')
);
--> statement-breakpoint
CREATE UNIQUE INDEX "unreviewed_mods_owner_plugin_name_uq" ON "unreviewed_mods" USING btree (lower("owner"),"plugin_name");