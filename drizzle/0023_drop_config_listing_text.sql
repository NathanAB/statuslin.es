ALTER TABLE "config_versions" ALTER COLUMN "title" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "configs" DROP COLUMN "title";--> statement-breakpoint
ALTER TABLE "configs" DROP COLUMN "description";--> statement-breakpoint
ALTER TABLE "configs" DROP COLUMN "interpreter";