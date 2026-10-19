import { readFileSync, writeFileSync } from 'node:fs'
import { CURATION_FILE, type CurationEntry, parseCuration } from '@/mods/curation'
import { createGitHub, type GitHub, type GitHubSource } from '@/mods/github'
import { terminalLine } from '@/mods/terminal-line'

/**
 * Find the curated mods whose authors have released since their pin, and move those pins in the
 * curation file. For each entry it reads the head of the repository's default branch; an entry is
 * re-pinned to that head when the head builds on the pin and plugin.json names a new version, or
 * names none, since Claude Code then versions the plugin by its commit and every commit reaches
 * existing installs. New commits that keep the version, a default branch that no longer builds on
 * the pin (a force-push), and a repository or pin GitHub no longer serves are listed and left alone.
 * It ends with a Markdown table for the curation pull request, so each compare link reaches the
 * reviewer. Nothing is published: the operator reviews each compare link in the curation file's
 * diff, merges it, and then runs run-repin-mods.ts. Any other GitHub error (rate limit, outage)
 * aborts the run before anything is written.
 *
 * AGENT USAGE — needs only GitHub, no DATABASE_URL, but a token: one run makes more requests than
 * GitHub allows an hour without one:
 *
 *   GITHUB_TOKEN=$(gh auth token) bun run updates:mods [curation-file]   # default src/mods/curation.json
 *
 * Exit code 0 when the check ran, re-pinned or not; 1 when the curation file is invalid or GitHub
 * failed.
 */

export interface CheckUpdatesDeps {
  github: Pick<
    GitHubSource,
    'findRepo' | 'resolveCommit' | 'pluginManifestExists' | 'pluginVersion'
  > &
    Pick<GitHub, 'compareCommits' | 'commitIsFetchable'>
  log: (line: string) => void
  /** Named in the summary. */
  file: string
}

interface Release {
  entry: CurationEntry
  head: string
  /** plugin.json's version at the pin and at the head; null when it names none. */
  from: string | null
  to: string | null
}

type Update =
  | { kind: 'unchanged' }
  | ({ kind: 'release' } & Release)
  | { kind: 'unreleased'; version: string }
  | { kind: 'diverged'; branch: string }
  | { kind: 'unreadable'; branch: string }
  | { kind: 'manifest gone'; branch: string }
  | { kind: 'repo gone' }
  | { kind: 'pin gone' }

/**
 * The author writes plugin.json's version, and it is printed next to the compare link the reviewer
 * clicks, so anything past a plain version (a sentence, another link, padding that pushes the real
 * link out of the line) is never printed or acted on.
 */
const PLAIN_VERSION = /^[0-9A-Za-z.+-]{1,64}$/

const isPlain = (version: string | null) => version === null || PLAIN_VERSION.test(version)

interface BranchHead {
  branch: string
  head: string
}

/** Null when GitHub no longer serves the repository, or it has no commits. */
async function readBranchHead(
  github: CheckUpdatesDeps['github'],
  repoUrl: string,
): Promise<BranchHead | null> {
  const repo = await github.findRepo(repoUrl)
  if (!repo) return null
  const head = await github.resolveCommit(repoUrl, repo.defaultBranch)
  return head ? { branch: repo.defaultBranch, head } : null
}

async function checkEntry(
  entry: CurationEntry,
  branchHead: BranchHead | null,
  github: CheckUpdatesDeps['github'],
): Promise<Update> {
  if (!branchHead) return { kind: 'repo gone' }
  const { branch, head } = branchHead
  const pin = entry.commitSha
  if (head === pin) return { kind: 'unchanged' }
  if (!(await github.commitIsFetchable(entry.repoUrl, pin))) return { kind: 'pin gone' }
  if ((await github.compareCommits(entry.repoUrl, pin, head)) !== 'ahead') {
    return { kind: 'diverged', branch }
  }
  const to = await github.pluginVersion(entry.repoUrl, entry.path, head)
  if (to === null && !(await github.pluginManifestExists(entry.repoUrl, entry.path, head))) {
    return { kind: 'manifest gone', branch }
  }
  const from = await github.pluginVersion(entry.repoUrl, entry.path, pin)
  if (!isPlain(to) || !isPlain(from)) return { kind: 'unreadable', branch }
  return to !== null && to === from
    ? { kind: 'unreleased', version: to }
    : { kind: 'release', entry, head, from, to }
}

const compareUrl = ({ entry, head }: Release) =>
  `${entry.repoUrl}/compare/${entry.commitSha}...${head}`

function describeUpdate(entry: CurationEntry, update: Update): string | null {
  const name = entry.pluginName
  switch (update.kind) {
    case 'unchanged':
      return null
    case 'release':
      return update.to === null
        ? `release ${name}: ${compareUrl(update)} (no version, so every commit updates installs)`
        : `release ${name}: ${compareUrl(update)} (${update.from ?? 'unversioned'} -> ${update.to})`
    case 'unreleased':
      return `ahead ${name}: version unchanged (${update.version}), not re-pinned`
    case 'diverged':
      return `diverged ${name}: ${update.branch} no longer builds on ${entry.commitSha.slice(0, 7)}, not re-pinned`
    case 'unreadable':
      return `unreadable ${name}: plugin.json's version at ${update.branch} is not a plain version, not re-pinned: read it by hand`
    case 'manifest gone':
      return `gone ${name}: ${update.branch} has no plugin.json in ${entry.path || 'the repository root'}, not re-pinned`
    case 'repo gone':
      return `gone ${name}: GitHub no longer serves ${entry.repoUrl} (deleted or private), not re-pinned`
    case 'pin gone':
      return `gone ${name}: GitHub no longer serves the pinned ${entry.commitSha.slice(0, 7)}, not re-pinned`
  }
}

const versionCell = (version: string | null) =>
  version === null ? 'unversioned' : `\`${version}\``

function releaseTable(releases: Release[]): string[] {
  return [
    '| Mod | Folder | Changes since the pin | Version |',
    '| --- | --- | --- | --- |',
    ...releases.map((release) => {
      const { entry, from, to } = release
      const folder = entry.path === '' ? 'the repository root' : `\`${entry.path}\``
      return `| ${entry.pluginName} | ${folder} | ${compareUrl(release)} | ${versionCell(from)} → ${versionCell(to)} |`
    }),
  ]
}

/** `updated` is the curation file's entries with each release's new commit, or null when none. */
export async function checkModUpdates(
  raw: unknown,
  deps: CheckUpdatesDeps,
): Promise<{ code: number; updated: unknown[] | null }> {
  const log = (line: string) => deps.log(terminalLine(line))
  const curation = parseCuration(raw)
  if (!curation.ok) {
    for (const error of curation.errors) log(`refused ${error}`)
    log('nothing re-pinned: fix the curation file first')
    return { code: 1, updated: null }
  }

  const heads = new Map<string, Promise<BranchHead | null>>()
  const releases = new Map<number, Release>()
  for (const [index, entry] of curation.entries.entries()) {
    const pending = heads.get(entry.repoUrl) ?? readBranchHead(deps.github, entry.repoUrl)
    heads.set(entry.repoUrl, pending)
    const update = await checkEntry(entry, await pending, deps.github)
    const line = describeUpdate(entry, update)
    if (line) log(line)
    if (update.kind === 'release') releases.set(index, update)
  }

  if (releases.size === 0) {
    log('no new releases')
    return { code: 0, updated: null }
  }
  log(
    `${releases.size} release(s) re-pinned in ${deps.file}: review each compare link, merge it, then run bun run with-env staging scripts/run-repin-mods.ts staging`,
  )
  log('')
  for (const line of releaseTable([...releases.values()])) log(line)
  // A valid curation file is an array of objects, one per entry in the same order.
  const updated = (raw as Record<string, unknown>[]).map((item, index) => {
    const release = releases.get(index)
    return release ? { ...item, commitSha: release.head } : item
  })
  return { code: 0, updated }
}

/** How the curation file is written, so a re-pin's diff is only its commitSha lines. */
export const formatCuration = (raw: unknown) => `${JSON.stringify(raw, null, 2)}\n`

async function main(): Promise<number> {
  const file = process.argv[2] ?? CURATION_FILE
  const { code, updated } = await checkModUpdates(JSON.parse(readFileSync(file, 'utf8')), {
    github: createGitHub(),
    log: (line) => console.log(line),
    file,
  })
  if (updated) writeFileSync(file, formatCuration(updated))
  return code
}

if (import.meta.main) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      console.error(terminalLine(`[check-mod-updates] ${err instanceof Error ? err.message : err}`))
      process.exit(1)
    },
  )
}
