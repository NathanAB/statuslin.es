import { describe, expect, it } from 'vitest'
import type { ClaudeRun } from '@/mods/release-review'
import type { checkModUpdates } from '../../scripts/check-mod-updates'
import {
  BRANCH,
  type OpenPrDeps,
  openModUpdatesPr,
  ownOpenPr,
  TITLE,
} from '../../scripts/open-mod-updates-pr'

const REPO = 'https://github.com/octocat/meters'
const PIN = 'a'.repeat(40)
const HEAD = 'b'.repeat(40)
const NEWER = 'c'.repeat(40)
const ANSWER = [
  'network: none',
  'exec: none',
  'filesystem: none',
  'env: none',
  'dependencies: none',
  'dynamic code: none',
  'input steps: none',
].join('\n')

const entry = (commitSha: string) => ({
  repoUrl: REPO,
  path: 'plugins/meter',
  commitSha,
  pluginName: 'meter',
  title: 'Meter',
})
const curation = (sha: string) => `${JSON.stringify([entry(sha)], null, 2)}\n`
const compare = (from: string, to: string) => `${REPO}/compare/${from}...${to}`

type CheckResult = Awaited<ReturnType<typeof checkModUpdates>>
const NONE: CheckResult = { code: 0, updated: null, releases: [] }
/** What the check finds on a curation file, by the pin it holds. */
const repinnedTo = (sha: string): CheckResult => ({ code: 0, updated: [entry(sha)], releases: [] })

interface Fakes {
  openPr?: { number: number; body: string } | null
  /** The pin on each branch. */
  pins?: { main: string; [BRANCH]?: string }
  checks?: Record<string, CheckResult>
  claude?: ClaudeRun
  diff?: string | Error
  editFails?: boolean
}

function run({
  openPr = null,
  pins = { main: PIN },
  checks = {},
  claude = { exitCode: 0, stdout: ANSWER, stderr: '' },
  diff = '+change',
  editFails = false,
}: Fakes) {
  const calls: string[] = []
  const prs: { title?: string; number?: number; body: string }[] = []
  const deps: OpenPrDeps = {
    findOpenPr: async () => openPr,
    readCuration: async (branch) => curation((pins as Record<string, string>)[branch] ?? ''),
    check: async (raw, log) => {
      const sha = (raw as { commitSha: string }[])[0]?.commitSha ?? ''
      calls.push(`check:${sha.slice(0, 1)}`)
      log('ahead deck: version unchanged (0.4.12), not re-pinned')
      return checks[sha] ?? NONE
    },
    version: async (_entry, sha) => (sha === PIN ? '1.2.0' : '1.3.0'),
    diff: async (release) => {
      calls.push(`diff:${release.entry.commitSha.slice(0, 1)}...${release.head.slice(0, 1)}`)
      if (diff instanceof Error) throw diff
      return diff
    },
    runClaude: async () => {
      calls.push('claude')
      return claude
    },
    commitCuration: async (content, fresh) => {
      calls.push(`commit:${fresh ? 'fresh' : 'on top'}:${content}`)
    },
    createPr: async (title, body) => {
      calls.push('create')
      prs.push({ title, body })
      return 'https://github.com/NathanAB/statuslin.es/pull/200'
    },
    editPr: async (number, body) => {
      calls.push('edit')
      if (editFails) throw new Error('body is too long')
      prs.push({ number, body })
    },
    log: () => {},
  }
  return { result: openModUpdatesPr(deps), calls, prs }
}

describe('openModUpdatesPr', () => {
  it('opens nothing when no mod has a new release', async () => {
    const { result, calls, prs } = run({})

    expect(await result).toBe(0)
    expect(calls).toEqual(['check:a'])
    expect(prs).toEqual([])
  })

  it('reviews, then re-pins on a fresh branch from main and opens one pull request', async () => {
    const { result, calls, prs } = run({ checks: { [PIN]: repinnedTo(HEAD) } })

    expect(await result).toBe(0)
    expect(calls).toEqual([
      'check:a',
      'diff:a...b',
      'claude',
      `commit:fresh:${curation(HEAD)}`,
      'create',
    ])
    expect(prs[0]?.title).toBe(TITLE)
    expect(prs[0]?.body).toContain(`| meter | \`plugins/meter\` | ${compare(PIN, HEAD)} |`)
    expect(prs[0]?.body).toContain(`\`\`\`text\n${ANSWER}\n\`\`\``)
    expect(prs[0]?.body).toContain('ahead deck: version unchanged')
  })

  it('adds to the open pull request, describing main’s pin to the commit the branch now holds', async () => {
    const { result, calls, prs } = run({
      openPr: { number: 7, body: compare(PIN, HEAD) },
      pins: { main: PIN, [BRANCH]: HEAD },
      checks: { [HEAD]: repinnedTo(NEWER) },
    })

    expect(await result).toBe(0)
    expect(calls).toEqual([
      'check:b',
      'diff:a...c',
      'claude',
      `commit:on top:${curation(NEWER)}`,
      'edit',
    ])
    expect(prs[0]?.number).toBe(7)
    expect(prs[0]?.body).toContain(compare(PIN, NEWER))
    expect(prs[0]?.body).not.toContain(compare(PIN, HEAD))
  })

  it('leaves an open pull request alone when nothing was released and its body is current', async () => {
    const { result, calls, prs } = run({
      openPr: { number: 7, body: `| meter | x | ${compare(PIN, HEAD)} |` },
      pins: { main: PIN, [BRANCH]: HEAD },
    })

    expect(await result).toBe(0)
    expect(calls).toEqual(['check:b'])
    expect(prs).toEqual([])
  })

  it('rewrites a body that no longer matches the branch, committing nothing', async () => {
    const { result, calls, prs } = run({
      openPr: { number: 7, body: `an earlier body: ${compare(PIN, NEWER)}` },
      pins: { main: PIN, [BRANCH]: HEAD },
    })

    expect(await result).toBe(0)
    expect(calls).toEqual(['check:b', 'diff:a...b', 'claude', 'edit'])
    expect(prs[0]?.body).toContain(compare(PIN, HEAD))
  })

  it('fails loudly when the edit fails after the commit, leaving a body the next run rewrites', async () => {
    const { result, calls } = run({
      openPr: { number: 7, body: compare(PIN, HEAD) },
      pins: { main: PIN, [BRANCH]: HEAD },
      checks: { [HEAD]: repinnedTo(NEWER) },
      editFails: true,
    })

    await expect(result).rejects.toThrow('body is too long')
    // The commit landed but the edit did not: the next run sees a body without the new compare
    // link and rewrites it (the test above).
    expect(calls.slice(-2)).toEqual([`commit:on top:${curation(NEWER)}`, 'edit'])
  })

  it.each([
    ['a failed claude call', { claude: { exitCode: 1, stdout: 'Not logged in', stderr: '' } }],
    ['an unreadable diff', { diff: new Error('git clone failed') }],
  ])(
    'still re-pins and opens the pull request after %s, marked not reviewed',
    async (_name, fakes) => {
      const { result, calls, prs } = run({ checks: { [PIN]: repinnedTo(HEAD) }, ...fakes })

      expect(await result).toBe(0)
      expect(calls).toContain(`commit:fresh:${curation(HEAD)}`)
      expect(prs[0]?.body).toContain('**Not reviewed** by an agent.')
    },
  )

  it('never lets a review decide: a mod with findings is still in the pull request', async () => {
    const stdout = ANSWER.replace('exec: none', 'exec: hook.sh:1 runs curl')
    const { calls, prs, result } = run({
      checks: { [PIN]: repinnedTo(HEAD) },
      claude: { exitCode: 0, stdout, stderr: '' },
    })

    await result
    expect(calls).toContain(`commit:fresh:${curation(HEAD)}`)
    expect(prs[0]?.body).toContain('exec: hook.sh:1 runs curl')
  })

  it('stops on a curation file the check refuses, writing nothing', async () => {
    const { result, calls, prs } = run({ checks: { [PIN]: { ...NONE, code: 1 } } })

    expect(await result).toBe(1)
    expect(calls).toEqual(['check:a'])
    expect(prs).toEqual([])
  })
})

describe('ownOpenPr', () => {
  const pr = (number: number, isCrossRepository: boolean, login: string) => ({
    number,
    body: `body ${number}`,
    isCrossRepository,
    headRepositoryOwner: { login },
  })

  it('takes only a pull request from this repository’s own branch, never a fork’s', () => {
    const prs = [pr(3, true, 'stranger'), pr(4, false, 'NathanAB')]
    expect(ownOpenPr(prs, 'NathanAB')).toEqual({ number: 4, body: 'body 4' })
  })

  it('finds none when only forks have a branch of that name', () => {
    expect(ownOpenPr([pr(3, true, 'stranger'), pr(5, true, 'NathanAB')], 'NathanAB')).toBeNull()
  })
})
