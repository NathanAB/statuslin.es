-- Custom SQL migration file, put your code below! --
-- Listing text moves from the config onto each version (ADR 0001). Every existing version
-- takes its config's current title and description; 0023 then drops the config's copies.
UPDATE "config_versions" AS v
SET "title" = c."title", "description" = c."description"
FROM "configs" AS c
WHERE c."id" = v."config_id";
