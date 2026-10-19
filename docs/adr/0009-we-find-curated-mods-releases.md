# We find curated mods' releases ourselves

Accepted 2026-10-19. A curated mod has no submitter, so only the operator can move its pin (ADR 0005). Until now that waited for the author to ask: the listing issue told them to let us know when they ship. The authors of Cache Tax, Deck and Prismantis each replied with a release to move to, and seven other mods had shipped past their pin without anyone asking (#168). Asking on every release is work for the author that buys nothing, since the release is already public on their default branch.

## What changes

1. **`bun run updates:mods`** reads `src/mods/curation.json` and, for each entry, compares the pin with the head of the repository's default branch. When the head builds on the pin and its plugin.json `version` differs, it moves the entry's `commitSha` to the head and prints the compare link. A commit without a new version is listed, not re-pinned: Claude Code only updates existing installs when the version changes, and a README edit is not worth a review. A head that no longer builds on the pin (a force-push) is listed and left alone.
2. **The curation change is the review.** Its diff goes up as a pull request like any re-pin, and the reviewer reads each compare link before merging, as SECURITY.md requires for every update.
3. **Re-pinning is unchanged.** `run-repin-mods.ts` already re-pins every curated mod whose `curation.json` commit isn't live, in one run per environment.
4. **Authors do nothing.** The listing issues say we pick up new releases on our own; a note there is only needed to ask for one sooner.

## Considered options

- **Let authors send updates themselves.** Treat the repository owner as the mod's submitter, so `/me` offers them the update flow submitted mods already have. It still needs the author to act on every release, and organisation repositories can't be matched to a user without the `read:org` scope. It may still be worth adding as a way to ask for a release sooner.
- **Queue detected releases in `/admin` as pending submissions.** A curated mod with a submission reads as a submitted one (`hasSubmission` is how the import, publish and render tell them apart), so this would blur the line ADR 0005 draws. Keeping `curation.json` the source of truth also keeps every curated pin in git history.
- **Re-pin on every new commit.** More reviews for changes no existing install receives.
- **Publish detected releases without review.** Ruled out by SECURITY.md: trust comes from a human reading each pinned commit.

## Consequences

- The operator runs `updates:mods` on a cadence (weekly is enough) instead of watching listing issues.
- Finding releases needs only GitHub, so `updates:mods` runs without a decrypt; the re-pin after it still runs from the operator's terminal.
