ALTER TABLE "config_versions" ADD COLUMN "rejection_reason" text;--> statement-breakpoint
ALTER TABLE "config_versions" ADD COLUMN "rejection_email_status" text;--> statement-breakpoint
ALTER TABLE "config_versions" ADD COLUMN "rejection_email_id" text;--> statement-breakpoint
ALTER TABLE "config_versions" ADD COLUMN "rejection_email_error" text;--> statement-breakpoint
ALTER TABLE "config_versions" ADD COLUMN "rejection_email_sent_at" timestamp with time zone;