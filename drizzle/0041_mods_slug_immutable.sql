-- Custom SQL migration file, put your code below! --
-- A mod's slug is its marketplace entry name, so renaming a published mod breaks every install
-- (ADR 0005). Approval names a draft when it publishes it, in the same UPDATE, so only a row that
-- was a draft before the update may change its slug. Writing the same slug back stays allowed.
CREATE FUNCTION "mods_refuse_slug_change"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'mod "%" is %; its slug never changes once it leaves draft', OLD."slug", OLD."status"
    USING ERRCODE = 'integrity_constraint_violation', CONSTRAINT = 'mods_slug_immutable', TABLE = 'mods', COLUMN = 'slug';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "mods_slug_immutable"
  BEFORE UPDATE OF "slug" ON "mods"
  FOR EACH ROW
  WHEN (OLD."status" <> 'draft' AND NEW."slug" IS DISTINCT FROM OLD."slug")
  EXECUTE FUNCTION "mods_refuse_slug_change"();
