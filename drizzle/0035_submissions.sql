CREATE TABLE "submissions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"config_version_id" uuid,
	"mod_version_id" uuid,
	"submitted_by" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"rejection_reason" text,
	"rejection_email_status" text,
	"rejection_email_id" text,
	"rejection_email_error" text,
	"rejection_email_sent_at" timestamp with time zone,
	"approval_email_status" text,
	"approval_email_id" text,
	"approval_email_error" text,
	"approval_email_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "submissions_config_version_id_unique" UNIQUE("config_version_id"),
	CONSTRAINT "submissions_mod_version_id_unique" UNIQUE("mod_version_id"),
	CONSTRAINT "submissions_id_is_version_id" CHECK ("submissions"."id" = coalesce("submissions"."config_version_id", "submissions"."mod_version_id")),
	CONSTRAINT "submissions_kind_version_check" CHECK (("submissions"."kind" = 'status_line' AND "submissions"."config_version_id" IS NOT NULL AND "submissions"."mod_version_id" IS NULL) OR ("submissions"."kind" = 'mod' AND "submissions"."mod_version_id" IS NOT NULL AND "submissions"."config_version_id" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_config_version_id_config_versions_id_fk" FOREIGN KEY ("config_version_id") REFERENCES "public"."config_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_mod_version_id_mod_versions_id_fk" FOREIGN KEY ("mod_version_id") REFERENCES "public"."mod_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_submitted_by_user_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "submissions_submitted_by_created_idx" ON "submissions" USING btree ("submitted_by","created_at");