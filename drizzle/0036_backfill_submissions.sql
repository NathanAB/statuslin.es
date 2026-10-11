-- Custom SQL migration file, put your code below! --
-- Review state moves off config_versions into submissions (ADR 0007). Every status line version
-- gets the submission it was reviewed as, keyed by its own id, submitted by its config's author.
-- Safe to run again: the release that drops the old columns re-runs it to copy versions written
-- by machines still on the old code during this deploy.
INSERT INTO "submissions" (
  "id", "kind", "config_version_id", "submitted_by", "status", "reviewed_by", "reviewed_at",
  "rejection_reason", "rejection_email_status", "rejection_email_id", "rejection_email_error",
  "rejection_email_sent_at", "approval_email_status", "approval_email_id", "approval_email_error",
  "approval_email_sent_at", "created_at"
)
SELECT
  v."id", 'status_line', v."id", c."author_id", v."status", v."reviewed_by", v."reviewed_at",
  v."rejection_reason", v."rejection_email_status", v."rejection_email_id", v."rejection_email_error",
  v."rejection_email_sent_at", v."approval_email_status", v."approval_email_id", v."approval_email_error",
  v."approval_email_sent_at", v."created_at"
FROM "config_versions" AS v
INNER JOIN "configs" AS c ON c."id" = v."config_id"
ON CONFLICT ("id") DO NOTHING;
