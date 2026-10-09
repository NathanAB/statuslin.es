ALTER TABLE "config_versions" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "config_versions" ADD COLUMN "description" text DEFAULT '' NOT NULL;