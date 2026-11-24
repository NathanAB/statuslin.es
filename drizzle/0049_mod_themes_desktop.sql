CREATE TABLE "mod_theme_desktop_previews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"theme_id" uuid NOT NULL,
	"png" "bytea" NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"card_png" "bytea" NOT NULL,
	"card_width" integer NOT NULL,
	"card_height" integer NOT NULL,
	"look_signature" text NOT NULL,
	"desktop_version" text NOT NULL,
	"engine_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mod_theme_desktop_previews_theme_id_unique" UNIQUE("theme_id"),
	CONSTRAINT "mod_theme_desktop_previews_look_check" CHECK ("mod_theme_desktop_previews"."look_signature" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "mod_theme_desktop_previews_size_check" CHECK ("mod_theme_desktop_previews"."width" > 0 AND "mod_theme_desktop_previews"."height" > 0 AND "mod_theme_desktop_previews"."card_width" > 0 AND "mod_theme_desktop_previews"."card_height" > 0)
);
--> statement-breakpoint
ALTER TABLE "mod_themes" DROP CONSTRAINT "mod_themes_kind_check";--> statement-breakpoint
ALTER TABLE "mod_themes" ALTER COLUMN "source" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "mod_themes" ADD COLUMN "switch_steps" jsonb;--> statement-breakpoint
ALTER TABLE "mod_theme_desktop_previews" ADD CONSTRAINT "mod_theme_desktop_previews_theme_id_mod_themes_id_fk" FOREIGN KEY ("theme_id") REFERENCES "public"."mod_themes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mod_themes" ADD CONSTRAINT "mod_themes_kind_shape_check" CHECK ((("mod_themes"."kind" = 'terminal' AND "mod_themes"."source" IS NOT NULL AND "mod_themes"."switch_steps" IS NULL) OR ("mod_themes"."kind" = 'desktop' AND "mod_themes"."source" IS NULL AND jsonb_typeof("mod_themes"."switch_steps") = 'array')) IS TRUE);--> statement-breakpoint
ALTER TABLE "mod_themes" ADD CONSTRAINT "mod_themes_kind_check" CHECK ("mod_themes"."kind" IN ('terminal', 'desktop'));