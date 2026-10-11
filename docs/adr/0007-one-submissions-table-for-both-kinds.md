---
status: accepted
---

# Review state lives in one submissions table for both kinds

A submission's review state (submitter, status, reviewer, rejection reason, approval and rejection
email delivery) lives in one `submissions` table, shared by status lines and mods, instead of on
`config_versions`. A submission's id is the id of the version it reviews, so server functions,
email deduplication keys and analytics keep addressing a version. The rate limit, the `/admin`
queue, `/me`, approve, reject and both emails are written once against this table, and each kind
supplies a small adapter: is it rendered, how publishing moves the live version, its email wording
and its review card. ADR 0003 still holds: a config's and a mod's content stay in their own tables.

## Considered Options

- **Review columns on both `config_versions` and `mod_versions`**: no status line data moves. But
  the submitter lives in `configs.author_id` for one kind and a new column for the other, so every
  shared query becomes two queries merged in code, and each later review change needs two
  migrations.
- **Share only the email delivery code**: it removes one near-duplicate, but the queue, `/me`, the
  rate limit and approval would still be copied per kind.
