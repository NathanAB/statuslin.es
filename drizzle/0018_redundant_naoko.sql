ALTER TABLE "configs" ADD COLUMN "all_tags" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
CREATE INDEX "configs_all_tags_gin" ON "configs" USING gin ("all_tags");