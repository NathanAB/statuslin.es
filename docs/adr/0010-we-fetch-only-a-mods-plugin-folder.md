# We fetch only a mod's plugin folder

Accepted 2026-10-27. Import, submit and render downloaded a mod's whole repository as one GitHub archive, then unpacked only the plugin folder in the sandbox. The download was capped at 2,000 files and 20 MB, so a mod in a folder of a large repository was refused for the size of everything around it. Anthropic's `diff` mod (`anthropics/claude-code`, over 2,000 files) and the Agent Standup band (`Atoll92/agent-standup`, over 20 MB) were both refused, although their folders hold 828 files in 523 KB and 8 files in 164 KB.

Claude Code installs a plugin that lives in a folder from a `git-subdir` source, and checks out only that folder. What a user installs is the folder, so the folder is what statuslin.es needs to inspect.

## What changes

1. **A sandbox that reaches only github.com fetches the folder.** It runs a shallow fetch of the pinned commit without file contents (`--depth 1 --filter=blob:none`), then a sparse checkout of the plugin folder alone (`--no-cone /<path>/`). It returns a tarball of that folder, which the offline sandboxes unpack, inspect and render as before. The fetch sandbox runs only git and tar, never the mod's code, and the host still never unpacks the tarball. A mod at the repository root is fetched the same way, with no sparse checkout.
2. **The caps apply to the folder.** The folder may hold at most 2,000 files, counted from git's trees before any file is downloaded, and its tarball at most 20 MB.
3. **Checks run before the checkout writes a file.** The fetched commit must be the pinned one. A submodule inside the folder is refused. A `.gitattributes` in the folder, in the repository root or in a folder above the plugin must set only line endings, because git applies those files to the plugin's files on checkout. One in a sibling folder applies to nothing Claude Code installs, so it is ignored.
4. **Git checks every file against its hash.** The bytes inspected are the pinned commit's, which the GitHub archive download didn't verify.

## What others do

- Claude Code's [`git-subdir` plugin source](https://code.claude.com/docs/en/plugins/marketplace-reference#git-subdir-plugin-source) fetches "one subdirectory of a git repository, fetched with a sparse checkout", asking the server for a partial clone. We run the same kind of fetch, so the inspected files are the installed files.
- Git's own tools for this are [partial clone](https://git-scm.com/docs/partial-clone) and [`git sparse-checkout`](https://git-scm.com/docs/git-sparse-checkout). GitHub serves both. GitHub's archive download has no option for one folder, which is why the whole repository was downloaded before.

## Considered options

- **Raise the caps.** Every render would still download the whole repository, and the next large repository would hit the new cap. GitHub's tree API also stops listing at 100,000 entries.
- **Build the folder's tarball on the host from GitHub's file API.** One request per file: 828 for `diff` on every import and every render, past the 60 an hour GitHub allows without a token.
- **Clone on the host.** That writes untrusted files to the host's disk, which the pipeline avoids: untrusted bytes go only into sandboxes.
- **Fetch inside the inspection sandbox.** That sandbox runs the mod's code when it records a preview, so it stays offline.

## Consequences

- Each fetch starts one extra sandbox, about 5 to 7 seconds. A run fetches each repository, folder and commit once.
- The only sandbox with network access holds git and the fetched files, and reaches only github.com.
- A submitted mod is now refused for the size of its folder, not its repository.
- The `.gitattributes` rule is unchanged. It still refuses `export-ignore` and `export-subst`, which only change an archive download and so no longer matter. Relaxing it is a separate decision.
