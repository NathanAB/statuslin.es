ALTER TABLE "config_versions" ADD COLUMN "approval_email_status" text;--> statement-breakpoint
ALTER TABLE "config_versions" ADD COLUMN "approval_email_id" text;--> statement-breakpoint
ALTER TABLE "config_versions" ADD COLUMN "approval_email_error" text;--> statement-breakpoint
ALTER TABLE "config_versions" ADD COLUMN "approval_email_sent_at" timestamp with time zone;