CREATE TABLE "mod_theme_previews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"theme_id" uuid NOT NULL,
	"segments" jsonb NOT NULL,
	"claude_code_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mod_theme_previews_theme_id_unique" UNIQUE("theme_id")
);
--> statement-breakpoint
CREATE TABLE "mod_themes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mod_version_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"window" text NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mod_themes_kind_check" CHECK ("mod_themes"."kind" IN ('terminal')),
	CONSTRAINT "mod_themes_window_check" CHECK ("mod_themes"."window" IN ('light', 'dark')),
	CONSTRAINT "mod_themes_key_check" CHECK ("mod_themes"."key" ~ '^[A-Za-z0-9][A-Za-z0-9._-]*$' AND length("mod_themes"."key") <= 64),
	CONSTRAINT "mod_themes_name_check" CHECK (length("mod_themes"."name") BETWEEN 1 AND 64)
);
--> statement-breakpoint
ALTER TABLE "mod_theme_previews" ADD CONSTRAINT "mod_theme_previews_theme_id_mod_themes_id_fk" FOREIGN KEY ("theme_id") REFERENCES "public"."mod_themes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mod_themes" ADD CONSTRAINT "mod_themes_mod_version_id_mod_versions_id_fk" FOREIGN KEY ("mod_version_id") REFERENCES "public"."mod_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "mod_themes_version_key_uq" ON "mod_themes" USING btree ("mod_version_id","kind","key");--> statement-breakpoint
CREATE UNIQUE INDEX "mod_themes_version_name_uq" ON "mod_themes" USING btree ("mod_version_id","kind",lower("name"));