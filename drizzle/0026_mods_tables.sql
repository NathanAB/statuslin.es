CREATE TABLE "mod_copy_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mod_id" uuid NOT NULL,
	"ip_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mod_previews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mod_version_id" uuid NOT NULL,
	"scenario_key" text NOT NULL,
	"segments" jsonb NOT NULL,
	"claude_code_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mod_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mod_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"repo_url" text NOT NULL,
	"path" text DEFAULT '' NOT NULL,
	"commit_sha" text NOT NULL,
	"plugin_version" text,
	"license" text,
	"footprint" jsonb NOT NULL,
	"validated_with" text NOT NULL,
	"input_steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"generated_content" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mod_versions_commit_sha_check" CHECK ("mod_versions"."commit_sha" ~ '^[0-9a-f]{40}$'),
	CONSTRAINT "mod_versions_repo_url_check" CHECK ("mod_versions"."repo_url" LIKE 'https://%')
);
--> statement-breakpoint
CREATE TABLE "mods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"plugin_name" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"author_github" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"current_version_id" uuid,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"all_tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"copy_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mods_slug_unique" UNIQUE("slug"),
	CONSTRAINT "mods_plugin_name_unique" UNIQUE("plugin_name")
);
--> statement-breakpoint
ALTER TABLE "mod_copy_events" ADD CONSTRAINT "mod_copy_events_mod_id_mods_id_fk" FOREIGN KEY ("mod_id") REFERENCES "public"."mods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mod_previews" ADD CONSTRAINT "mod_previews_mod_version_id_mod_versions_id_fk" FOREIGN KEY ("mod_version_id") REFERENCES "public"."mod_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mod_versions" ADD CONSTRAINT "mod_versions_mod_id_mods_id_fk" FOREIGN KEY ("mod_id") REFERENCES "public"."mods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "mod_copy_events_mod_ip_uq" ON "mod_copy_events" USING btree ("mod_id","ip_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "mod_previews_version_scenario_uq" ON "mod_previews" USING btree ("mod_version_id","scenario_key");--> statement-breakpoint
CREATE UNIQUE INDEX "mod_versions_mod_version_uq" ON "mod_versions" USING btree ("mod_id","version_number");--> statement-breakpoint
CREATE UNIQUE INDEX "mod_versions_repo_path_commit_uq" ON "mod_versions" USING btree ("repo_url","path","commit_sha");