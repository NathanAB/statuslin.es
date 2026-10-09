-- Custom SQL migration file, put your code below! --
-- Every config that has gone live takes its live version's approval time as its first-publish
-- date, the same value the `new` sort read before this column existed. Removed configs keep
-- theirs too, so a restore puts them back in place. Configs never published stay null.
UPDATE "configs" AS c
SET "first_published_at" = coalesce(v."reviewed_at", c."created_at")
FROM "config_versions" AS v
WHERE v."id" = c."current_version_id" AND c."first_published_at" IS NULL;
