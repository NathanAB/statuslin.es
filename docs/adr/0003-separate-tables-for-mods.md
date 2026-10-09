# Mods get their own tables, merged with configs only at query time

The gallery shows status lines and mods together, but mods live in their own `mods` and `mod_versions` tables instead of a `kind` column on `configs`. A mod version is a repo, path and commit with a footprint, not one script with an interpreter; a curated mod's author is a GitHub owner who never signed in, while `configs.author_id` must be a site user; and "config" means a status line config, so storing mods there would mislabel them. The gallery list query merges both kinds into one sorted list, which leaves the status line submit, render and review code untouched.

## Considered Options

- **A `kind` column on `configs`**: one table and simpler gallery queries, but every status-line-only path (submit, install prompt, rerender) would need a filter, mod-only columns would be null for every config, and the author foreign key would have to loosen.
