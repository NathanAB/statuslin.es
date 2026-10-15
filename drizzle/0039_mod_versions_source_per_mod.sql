DROP INDEX "mod_versions_repo_path_commit_uq";--> statement-breakpoint
CREATE UNIQUE INDEX "mod_versions_mod_source_uq" ON "mod_versions" USING btree ("mod_id","repo_url","path","commit_sha");