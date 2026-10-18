-- Custom SQL migration file, put your code below! --
-- A mod's live version is one of its own: the pair (current_version_id, id) must be a version's
-- (id, mod_id). A NULL current_version_id skips the check (MATCH SIMPLE). Deferred to commit
-- because insertDraftMod (src/mods/import.ts) writes the draft pointing at its first version
-- before that version row exists, in one transaction; the version can't come first, since its
-- mod_id references the mod. Drizzle's schema DSL has no DEFERRABLE, so the key lives here.
ALTER TABLE "mods" ADD CONSTRAINT "mods_current_version_fk"
  FOREIGN KEY ("current_version_id", "id") REFERENCES "mod_versions" ("id", "mod_id")
  DEFERRABLE INITIALLY DEFERRED;
