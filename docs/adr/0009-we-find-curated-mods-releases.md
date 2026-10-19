# We find curated mods' releases ourselves

Accepted 2026-10-19. A curated mod has no submitter, so only the operator can move its pin (ADR 0005). Until now that waited for the author to ask: the listing issue told them to let us know when they ship. The authors of Cache Tax, Deck and Prismantis each replied with a release to move to, and seven other mods had shipped past their pin without anyone asking (#168). Asking on every release is work for the author that buys nothing, since the release is already public on their default branch.

## What changes

1. **`bun run updates:mods`** reads `src/mods/curation.json` and, for each entry, compares the pin with the head of the repository's default branch. When the head builds on the pin and its plugin.json `version` differs, it moves the entry's `commitSha` to the head and prints the compare link. A versioned mod's commit that keeps the version is listed, not re-pinned: Claude Code updates existing installs only when the version changes, and a README edit is not worth a review. A mod with no version is re-pinned on every new commit, since Claude Code then versions it by its commit and every commit reaches existing installs. A head that no longer builds on the pin (a force-push), a repository, pin or plugin.json GitHub no longer serves, and a version that isn't a plain version string are listed and left alone, so one gone repository doesn't hide everyone else's releases. The author writes the version, so a sentence or a link in it is never printed next to the compare link the reviewer clicks.
2. **The curation change is the review.** Its diff goes up as a pull request like any re-pin, with the table `updates:mods` ends with (mod, folder, compare link, versions) in its body, so the links reach the reviewer, who reads each one before merging, as SECURITY.md requires for every update. GitHub compares the whole repository, so for a mod in a shared repository the folder column says where to look.
3. **Only a merged curation file goes live.** `run-repin-mods.ts` re-pins every curated mod whose `curation.json` commit isn't live, so it now refuses unless the file is byte for byte the one on `origin/main`. Otherwise `updates:mods` followed by `run-repin-mods.ts` in one checkout would publish commits nobody reviewed. A hand re-pin goes through a merged pull request too.
4. **Authors only bump their version.** A release is a new plugin.json `version` (or any commit, for a mod with none), which is what Claude Code updates existing installs on anyway. A note on each listing issue tells authors this; asking is only needed for a release sooner, or for a change shipped without a bump. A force-push, a moved plugin or an odd version still needs the author or the operator to step in.

## Considered options

- **Let authors send updates themselves.** Treat the repository owner as the mod's submitter, so `/me` offers them the update flow submitted mods already have. It still needs the author to act on every release, and organisation repositories can't be matched to a user without the `read:org` scope. It may still be worth adding as a way to ask for a release sooner.
- **Queue detected releases in `/admin` as pending submissions.** A curated mod with a submission reads as a submitted one (`hasSubmission` is how the import, publish and render tell them apart), so this would blur the line ADR 0005 draws. Keeping `curation.json` the source of truth also keeps every curated pin in git history.
- **Re-pin on every new commit.** More reviews for changes no existing install receives.
- **Publish detected releases without review.** Ruled out by SECURITY.md: trust comes from a human reading each pinned commit.

## Consequences

- The operator runs `updates:mods` weekly instead of watching listing issues. Nothing schedules it yet, so this depends on the operator remembering.
- Finding releases needs only GitHub and a token (GitHub allows 60 requests an hour without one, fewer than one run makes), so `updates:mods` runs without a decrypt; the re-pin after it still runs from the operator's terminal, from an up-to-date main.
