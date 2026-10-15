CREATE TABLE "mod_desktop_previews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mod_version_id" uuid NOT NULL,
	"scenario_key" text NOT NULL,
	"kind" text NOT NULL,
	"png" "bytea",
	"width" integer,
	"height" integer,
	"card_anchor" text,
	"desktop_version" text NOT NULL,
	"engine_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mod_desktop_previews_kind_check" CHECK ((("mod_desktop_previews"."kind" = 'shot' AND "mod_desktop_previews"."png" IS NOT NULL AND "mod_desktop_previews"."width" > 0 AND "mod_desktop_previews"."height" > 0 AND "mod_desktop_previews"."card_anchor" IN ('top', 'bottom')) OR ("mod_desktop_previews"."kind" = 'nothing' AND "mod_desktop_previews"."png" IS NULL AND "mod_desktop_previews"."width" IS NULL AND "mod_desktop_previews"."height" IS NULL AND "mod_desktop_previews"."card_anchor" IS NULL)) IS TRUE)
);
--> statement-breakpoint
ALTER TABLE "mod_desktop_previews" ADD CONSTRAINT "mod_desktop_previews_mod_version_id_mod_versions_id_fk" FOREIGN KEY ("mod_version_id") REFERENCES "public"."mod_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "mod_desktop_previews_version_scenario_uq" ON "mod_desktop_previews" USING btree ("mod_version_id","scenario_key");