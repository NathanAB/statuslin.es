# Anyone can submit a mod, and its repository's owner is credited

Any signed-in user can submit a mod by pasting a link to it on GitHub. The mod is credited to the owner of that repository, and the submitter is stored privately, for review emails, the rate limit and updates. A status line's submitter is always its author. A mod can be sent by someone else, because its code lives in the author's own repository, and SECURITY.md places trust in the review of a pinned commit, not in who sent it. Curation already lists authors who never signed in.

A mod's name is the plugin's own name, or `<name>-<owner>` when another mod already has that name. It never changes once published: the marketplace sets `forceRemoveDeletedPlugins`, so renaming an entry uninstalls the mod for everyone who has it.

The name is picked when the mod is approved. Until then a submission has a provisional slug (`<name>-<6 hex>`) and holds neither the name nor the plugin's folder against anyone but its submitter, so submitting someone's plugin first, or leaving a rejected submission behind, gains nothing. Approval refuses a draft whose folder a listed mod already holds.

## Considered Options

- **Only the repository owner may submit**: `user.username` holds the GitHub login, so this is easy to check for personal repositories. Organisation repositories would need the `read:org` scope, and most mod authors don't use the site.
- **Always add the owner to the name**: nobody gains a short name by submitting first, but every name gets longer.

## Consequences

- Only a mod's submitter can send an update. Curated mods have no submitter and are re-pinned from the command line.
- Two listed mods can have the same plugin.json name, one of them with its owner added. A user who enables both gets only one working, since Claude Code runs one hooks module per plugin name.
