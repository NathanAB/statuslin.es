import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CURATION_FILE, type CurationEntry, parseCuration } from '@/mods/curation'
import { createGitHub } from '@/mods/github'
import { claudeCli, type Review, type RunClaude, reviewDiff } from '@/mods/release-review'
import { terminalLine } from '@/mods/terminal-line'
import {
  checkModUpdates,
  compareUrl,
  formatCuration,
  isPlain,
  type Release,
} from './check-mod-updates'
import { modUpdatesPrBody } from './mod-updates-pr-body'

/**
 * The weekly re-pin pull request (ADR 0009): run updates:mods' check, have an agent read each
 * release's diff, and open one pull request with the curation file's change, or add to the one
 * already open. An agent's read is advisory and decides nothing: every release found is re-pinned
 * and listed whatever its review says, and a failed review shows as "Not reviewed". It never
 * merges, publishes or re-pins: the operator's merge is the review, and run-repin-mods.ts follows
 * it.
 *
 * It reads and writes the curation file through the GitHub API, so the checkout it runs from is
 * left alone; run it from an up-to-date main, since that's the code it runs.
 *
 * AGENT USAGE — needs `gh` signed in, and `claude` signed in to the operator's subscription:
 *
 *   GITHUB_TOKEN=$(gh auth token) bun run updates:mods:pr
 *
 * Exit code 0 when it ran, whether or not it opened anything; 1 when the curation file is invalid
 * or GitHub, git or gh failed.
 */

/** The one branch every run re-pins on, so a run finds the pull request an earlier run opened. */
export const BRANCH = 'mods/updates'
export const TITLE = 'chore(mods): re-pin curated mods to their new releases'

type CheckResult = Awaited<ReturnType<typeof checkModUpdates>>

/** The pull request a run adds to; only one from this repository's own branch counts. */
export interface OpenPr {
  number: number
  body: string
}

export interface OpenPrDeps {
  findOpenPr(): Promise<OpenPr | null>
  /** The curation file's text on a branch. */
  readCuration(branch: string): Promise<string>
  /** updates:mods' check on a curation file, logging its lines. */
  check(raw: unknown, log: (line: string) => void): Promise<CheckResult>
  /** plugin.json's version for the mod at a commit, or null when it names none. */
  version(entry: CurationEntry, sha: string): Promise<string | null>
  /** The release's diff, limited to the mod's folder. */
  diff(release: Release): Promise<string>
  runClaude: RunClaude
  /** Commits the curation file on BRANCH, first resetting BRANCH to main when `fresh`. */
  commitCuration(content: string, fresh: boolean): Promise<void>
  /** Returns the new pull request's URL. */
  createPr(title: string, body: string): Promise<string>
  editPr(number: number, body: string): Promise<void>
  log(line: string): void
}

/**
 * The open pull request from BRANCH in this repository. A fork can open one from a branch of the
 * same name; taking that would put the re-pin's body on code nobody reviewed.
 */
export function ownOpenPr(
  prs: {
    number: number
    body: string
    isCrossRepository: boolean
    headRepositoryOwner: { login: string }
  }[],
  owner: string,
): OpenPr | null {
  const own = prs.find((pr) => !pr.isCrossRepository && pr.headRepositoryOwner.login === owner)
  return own ? { number: own.number, body: own.body } : null
}

/** The lines updates:mods prints for a mod it left alone. */
const NOT_REPINNED = /^(ahead|diverged|unreadable|gone) /

const entriesOf = (text: string): CurationEntry[] => {
  const curation = parseCuration(JSON.parse(text))
  if (!curation.ok) throw new Error(`invalid curation file: ${curation.errors.join('; ')}`)
  return curation.entries
}

/**
 * What merging the branch changes: each mod from main's pin to the commit the branch holds, so the
 * body describes exactly the commit the merge pins.
 */
async function pinnedReleases(deps: OpenPrDeps, main: string, branch: string): Promise<Release[]> {
  const pinned = new Map(entriesOf(main).map((entry) => [entry.pluginName, entry]))
  const releases: Release[] = []
  for (const { pluginName, commitSha: head } of entriesOf(branch)) {
    const entry = pinned.get(pluginName)
    if (!entry || entry.commitSha === head) continue
    const version = async (sha: string) => {
      const found = await deps.version(entry, sha)
      return isPlain(found) ? found : 'unreadable'
    }
    releases.push({ entry, head, from: await version(entry.commitSha), to: await version(head) })
  }
  return releases
}

const COMPARE_LINK = /https:\/\/github\.com\/[^\s|)`]+\/compare\/[0-9a-f]{40}\.\.\.[0-9a-f]{40}/g

/** The body names exactly the compare links the branch's pins make. */
function bodyMatches(body: string, releases: Release[]): boolean {
  const inBody = new Set(body.match(COMPARE_LINK) ?? [])
  const expected = new Set(releases.map(compareUrl))
  return inBody.size === expected.size && [...expected].every((link) => inBody.has(link))
}

async function reviewRelease(deps: OpenPrDeps, release: Release): Promise<Review> {
  let diff: string
  try {
    diff = await deps.diff(release)
  } catch (err) {
    return { kind: 'not reviewed', reason: `could not read the diff: ${(err as Error).message}` }
  }
  return reviewDiff(diff, deps.runClaude)
}

export async function openModUpdatesPr(deps: OpenPrDeps): Promise<number> {
  const open = await deps.findOpenPr()
  // An open pull request may hold the operator's own edits (inputSteps), so new releases go on top.
  const base = await deps.readCuration(open ? BRANCH : 'main')
  const notes: string[] = []
  const checked = await deps.check(JSON.parse(base), (line) => {
    deps.log(line)
    if (NOT_REPINNED.test(line)) notes.push(line)
  })
  if (checked.code !== 0) return checked.code
  if (!open && !checked.updated) return 0

  const branch = checked.updated ? formatCuration(checked.updated) : base
  const releases = await pinnedReleases(deps, open ? await deps.readCuration('main') : base, branch)
  if (open && !checked.updated && bodyMatches(open.body, releases)) {
    deps.log(`#${open.number} is unchanged`)
    return 0
  }

  // The body is ready before anything is written. If the edit below fails after the commit, the
  // body no longer matches the branch, and the next run rewrites it.
  const reviews: Review[] = []
  for (const release of releases) {
    deps.log(`reviewing ${release.entry.pluginName}`)
    reviews.push(await reviewRelease(deps, release))
  }
  const body = modUpdatesPrBody({ releases, reviews, notes })

  if (checked.updated) await deps.commitCuration(branch, !open)
  if (open) {
    await deps.editPr(open.number, body)
    deps.log(`updated #${open.number}: read each compare link, then merge it`)
  } else {
    deps.log(`opened ${await deps.createPr(TITLE, body)}: read each compare link, then merge it`)
  }
  return 0
}

function run(command: string, args: string[], options: { input?: string | undefined } = {}) {
  const result = spawnSync(command, args, {
    ...options,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    // A deleted or private repository fails the clone instead of waiting for a password.
    // biome-ignore lint/style/useNamingConvention: environment variable name.
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  })
  if (result.error) throw new Error(`failed to run ${command}: ${result.error.message}`)
  if (result.status !== 0) {
    throw new Error(`${command} ${args[0]} exited ${result.status}: ${result.stderr.trim()}`)
  }
  return result.stdout
}

const gh = (args: string[], input?: string) => run('gh', args, { input }).trim()

/**
 * Read with git rather than GitHub's compare API, which leaves out large patches. The clone is the
 * author's code: git only reads it, with no external diff or textconv programs, and it is deleted.
 */
function diffInFolder({ entry, head }: Release): string {
  const dir = mkdtempSync(join(tmpdir(), 'mod-release-'))
  try {
    run('git', ['clone', '--quiet', '--filter=blob:none', '--no-checkout', entry.repoUrl, dir])
    return run('git', [
      ...['-C', dir, 'diff', '--no-ext-diff', '--no-textconv', '--no-color'],
      `${entry.commitSha}..${head}`,
      '--',
      entry.path || '.',
    ])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

function ghDeps(): OpenPrDeps {
  const repo = gh(['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner'])
  const contents = `repos/${repo}/contents/${CURATION_FILE}`
  const github = createGitHub()
  return {
    async findOpenPr() {
      const fields = 'number,body,isCrossRepository,headRepositoryOwner'
      const prs = gh([
        ...['pr', 'list', '--repo', repo, '--head', BRANCH, '--state', 'open'],
        ...['--json', fields],
      ])
      return ownOpenPr(JSON.parse(prs), repo.split('/')[0] ?? '')
    },
    async readCuration(branch) {
      return gh([
        'api',
        `${contents}?ref=${branch}`,
        '-H',
        'Accept: application/vnd.github.raw+json',
      ])
    },
    check: (raw, log) => checkModUpdates(raw, { github, log, file: CURATION_FILE }),
    version: (entry, sha) => github.pluginVersion(entry.repoUrl, entry.path, sha),
    diff: async (release) => diffInFolder(release),
    runClaude: claudeCli,
    async commitCuration(content, fresh) {
      if (fresh) {
        const main = gh(['api', `repos/${repo}/git/ref/heads/main`, '--jq', '.object.sha'])
        const refs = `repos/${repo}/git/refs`
        try {
          gh([
            'api',
            '-X',
            'PATCH',
            `${refs}/heads/${BRANCH}`,
            '-f',
            `sha=${main}`,
            '-F',
            'force=true',
          ])
        } catch {
          gh(['api', '-X', 'POST', refs, '-f', `ref=refs/heads/${BRANCH}`, '-f', `sha=${main}`])
        }
      }
      const sha = gh(['api', `${contents}?ref=${BRANCH}`, '--jq', '.sha'])
      gh([
        ...['api', '-X', 'PUT', contents, '-f', `message=${TITLE}`, '-f', `sha=${sha}`],
        ...['-f', `branch=${BRANCH}`, '-f', `content=${Buffer.from(content).toString('base64')}`],
      ])
    },
    async createPr(title, body) {
      return gh(
        [
          ...['pr', 'create', '--repo', repo, '--base', 'main', '--head', BRANCH],
          ...['--title', title, '--body-file', '-'],
        ],
        body,
      )
    },
    async editPr(number, body) {
      gh(['pr', 'edit', String(number), '--repo', repo, '--body-file', '-'], body)
    },
    log: (line) => console.log(terminalLine(line)),
  }
}

if (import.meta.main) {
  openModUpdatesPr(ghDeps()).then(
    (code) => process.exit(code),
    (err) => {
      console.error(
        terminalLine(`[open-mod-updates-pr] ${err instanceof Error ? err.message : err}`),
      )
      process.exit(1)
    },
  )
}
