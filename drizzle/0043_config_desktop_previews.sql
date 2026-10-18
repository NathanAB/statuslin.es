CREATE TABLE "config_desktop_previews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"config_version_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"png" "bytea",
	"width" integer,
	"height" integer,
	"desktop_version" text NOT NULL,
	"engine_version" text NOT NULL,
	"mod_commit_sha" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "config_desktop_previews_config_version_id_unique" UNIQUE("config_version_id"),
	CONSTRAINT "config_desktop_previews_kind_check" CHECK ((("config_desktop_previews"."kind" = 'shot' AND "config_desktop_previews"."png" IS NOT NULL AND "config_desktop_previews"."width" > 0 AND "config_desktop_previews"."height" > 0) OR ("config_desktop_previews"."kind" = 'nothing' AND "config_desktop_previews"."png" IS NULL AND "config_desktop_previews"."width" IS NULL AND "config_desktop_previews"."height" IS NULL)) IS TRUE)
);
--> statement-breakpoint
ALTER TABLE "config_desktop_previews" ADD CONSTRAINT "config_desktop_previews_config_version_id_config_versions_id_fk" FOREIGN KEY ("config_version_id") REFERENCES "public"."config_versions"("id") ON DELETE cascade ON UPDATE no action;