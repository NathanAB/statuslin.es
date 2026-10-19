import type { Review } from '@/mods/release-review'
import { compareUrl, type Release, releaseTable } from './check-mod-updates'

/** A fence longer than any run of backticks in `text`, so nothing in it can close the block. */
export function fenced(text: string): string {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length))
  const fence = '`'.repeat(Math.max(3, longest + 1))
  return `${fence}text\n${text}\n${fence}`
}

function reviewSection(release: Release, review: Review): string {
  const { entry } = release
  const folder = entry.path === '' ? 'the repository root' : `\`${entry.path}\``
  const read =
    review.kind === 'reviewed'
      ? fenced(review.text)
      : `**Not reviewed** by an agent. Read the compare link.\n\n${fenced(review.reason)}`
  return `### ${entry.pluginName}\n\nFolder ${folder}, changes: ${compareUrl(release)}\n\n${read}`
}

/**
 * The re-pin pull request's body. The agent reviews are model output from a diff the mod's author
 * wrote, so each is fenced and labelled advisory; the human merging reads each compare link.
 */
export function modUpdatesPrBody(input: {
  releases: Release[]
  /** One per release, in the same order. */
  reviews: Review[]
  /** The mods updates:mods listed and left alone. */
  notes: string[]
}): string {
  const sections = [
    'Authors of these curated mods have released since their pin, so this moves each pin to the release (ADR 0009). `bun run updates:mods:pr` opened it, and later runs update this pull request instead of opening another.',
    '**Read each compare link before merging.** Your merge is the human review SECURITY.md requires. The agent reviews below are advisory: each is a model reading the diff with no tools, not an approval, and a mod marked "Not reviewed" had no agent read at all.',
    'After merging, re-pin with `bun run with-env staging scripts/run-repin-mods.ts staging`, then prod ("Re-pin a mod" in `docs/deploy.md`).',
    releaseTable(input.releases).join('\n'),
    '## Agent reviews (advisory, not an approval)',
    ...input.releases.map((release, index) =>
      reviewSection(
        release,
        input.reviews[index] ?? { kind: 'not reviewed', reason: 'no review ran' },
      ),
    ),
  ]
  if (input.notes.length) sections.push('## Not re-pinned', fenced(input.notes.join('\n')))
  return `${sections.join('\n\n')}\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)\n`
}
