import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CURATION_FILE } from '@/mods/curation'
import { createGitHub } from '@/mods/github'
import { claudeCli, type Review, type RunClaude, reviewDiff } from '@/mods/release-review'
import { terminalLine } from '@/mods/terminal-line'
import { checkModUpdates, formatCuration, type Release } from './check-mod-updates'
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

export interface OpenPrDeps {
  /** The open pull request from BRANCH, or null. */
  findOpenPr(): Promise<number | null>
  /** The curation file's text on a branch. */
  readCuration(branch: string): Promise<string>
  /** updates:mods' check on a curation file, logging its lines. */
  check(raw: unknown, log: (line: string) => void): Promise<CheckResult>
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

/** The lines updates:mods prints for a mod it left alone. */
const NOT_REPINNED = /^(ahead|diverged|unreadable|gone) /

async function checkBranch(deps: OpenPrDeps, branch: string) {
  const notes: string[] = []
  const result = await deps.check(JSON.parse(await deps.readCuration(branch)), (line) => {
    deps.log(line)
    if (NOT_REPINNED.test(line)) notes.push(line)
  })
  return { ...result, notes }
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
  const onBranch = await checkBranch(deps, open === null ? 'main' : BRANCH)
  if (onBranch.code !== 0) return onBranch.code
  if (!onBranch.updated) {
    if (open !== null) deps.log(`#${open} is unchanged`)
    return 0
  }
  // The body covers everything the merge changes, so it compares each mod with main's pin.
  const fromMain = open === null ? onBranch : await checkBranch(deps, 'main')
  if (fromMain.code !== 0) return fromMain.code

  const reviews: Review[] = []
  for (const release of fromMain.releases) {
    deps.log(`reviewing ${release.entry.pluginName}`)
    reviews.push(await reviewRelease(deps, release))
  }
  const body = modUpdatesPrBody({ releases: fromMain.releases, reviews, notes: fromMain.notes })

  await deps.commitCuration(formatCuration(onBranch.updated), open === null)
  if (open !== null) {
    await deps.editPr(open, body)
    deps.log(`updated #${open}: read each compare link, then merge it`)
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
      const number = gh([
        ...['pr', 'list', '--repo', repo, '--head', BRANCH, '--state', 'open'],
        ...['--json', 'number', '--jq', '.[0].number'],
      ])
      return number ? Number(number) : null
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
