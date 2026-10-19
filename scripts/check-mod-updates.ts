import { readFileSync, writeFileSync } from 'node:fs'
import { CURATION_FILE, type CurationEntry, parseCuration } from '@/mods/curation'
import { createGitHub, type GitHub, type GitHubSource } from '@/mods/github'
import { terminalLine } from '@/mods/terminal-line'

/**
 * Find the curated mods whose authors have released since their pin, and move those pins in the
 * curation file. For each entry it reads the head of the repository's default branch; an entry is
 * re-pinned to that head only when the head builds on the pin and its plugin.json names a new
 * version. New commits without a new version, and a default branch that no longer builds on the pin
 * (a force-push), are listed and left alone. Nothing is published: the operator reviews each
 * compare link in the curation file's diff, merges it, and then runs run-repin-mods.ts. A GitHub
 * error (rate limit, outage) aborts the run before anything is written.
 *
 * AGENT USAGE — needs only GitHub, no DATABASE_URL; the token raises the rate limit:
 *
 *   GITHUB_TOKEN=$(gh auth token) bun run updates:mods [curation-file]   # default src/mods/curation.json
 *
 * Exit code 0 when the check ran, re-pinned or not; 1 when the curation file is invalid or GitHub
 * failed.
 */

export interface CheckUpdatesDeps {
  github: Pick<GitHubSource, 'repoInfo' | 'resolveCommit' | 'pluginVersion'> &
    Pick<GitHub, 'compareCommits'>
  log: (line: string) => void
  /** Named in the summary. */
  file: string
}

type Update =
  | { kind: 'unchanged' }
  | { kind: 'release'; head: string; from: string | null; to: string }
  | { kind: 'unreleased'; branch: string; version: string | null }
  | { kind: 'diverged'; branch: string }

interface BranchHead {
  branch: string
  head: string
}

async function readBranchHead(
  github: CheckUpdatesDeps['github'],
  repoUrl: string,
): Promise<BranchHead> {
  const { defaultBranch } = await github.repoInfo(repoUrl)
  const head = await github.resolveCommit(repoUrl, defaultBranch)
  if (!head) throw new Error(`${repoUrl} has no ${defaultBranch} branch`)
  return { branch: defaultBranch, head }
}

async function checkEntry(
  entry: CurationEntry,
  { branch, head }: BranchHead,
  github: CheckUpdatesDeps['github'],
): Promise<Update> {
  const pin = entry.commitSha
  if (head === pin) return { kind: 'unchanged' }
  if ((await github.compareCommits(entry.repoUrl, pin, head)) !== 'ahead') {
    return { kind: 'diverged', branch }
  }
  const to = await github.pluginVersion(entry.repoUrl, entry.path, head)
  const from = await github.pluginVersion(entry.repoUrl, entry.path, pin)
  return to !== null && to !== from
    ? { kind: 'release', head, from, to }
    : { kind: 'unreleased', branch, version: to }
}

function describeUpdate(entry: CurationEntry, update: Update): string | null {
  const name = entry.pluginName
  switch (update.kind) {
    case 'unchanged':
      return null
    case 'release':
      return `release ${name} ${update.from ?? 'unversioned'} -> ${update.to}: ${entry.repoUrl}/compare/${entry.commitSha}...${update.head}`
    case 'unreleased':
      return update.version === null
        ? `ahead ${name}: plugin.json has no version at ${update.branch}, not re-pinned`
        : `ahead ${name}: version unchanged (${update.version}), not re-pinned`
    case 'diverged':
      return `diverged ${name}: ${update.branch} no longer builds on ${entry.commitSha.slice(0, 7)}, not re-pinned`
  }
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

  const heads = new Map<string, Promise<BranchHead>>()
  const releases = new Map<number, string>()
  for (const [index, entry] of curation.entries.entries()) {
    const pending = heads.get(entry.repoUrl) ?? readBranchHead(deps.github, entry.repoUrl)
    heads.set(entry.repoUrl, pending)
    const update = await checkEntry(entry, await pending, deps.github)
    const line = describeUpdate(entry, update)
    if (line) log(line)
    if (update.kind === 'release') releases.set(index, update.head)
  }

  if (releases.size === 0) {
    log('no new releases')
    return { code: 0, updated: null }
  }
  log(
    `${releases.size} release(s) re-pinned in ${deps.file}: review each compare link, merge it, then run bun run with-env staging scripts/run-repin-mods.ts staging`,
  )
  // A valid curation file is an array of objects, one per entry in the same order.
  const updated = (raw as Record<string, unknown>[]).map((item, index) => {
    const head = releases.get(index)
    return head ? { ...item, commitSha: head } : item
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
