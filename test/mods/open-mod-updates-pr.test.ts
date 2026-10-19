import { describe, expect, it } from 'vitest'
import type { ClaudeRun } from '@/mods/release-review'
import type { checkModUpdates, Release } from '../../scripts/check-mod-updates'
import { BRANCH, type OpenPrDeps, openModUpdatesPr, TITLE } from '../../scripts/open-mod-updates-pr'

const PIN = 'a'.repeat(40)
const HEAD = 'b'.repeat(40)
const NEWER = 'c'.repeat(40)

const entry = (commitSha: string) => ({
  repoUrl: 'https://github.com/octocat/meters',
  path: 'plugins/meter',
  commitSha,
  pluginName: 'meter',
  title: 'Meter',
})
const release = (head: string): Release => ({
  entry: { ...entry(PIN), inputSteps: [] },
  head,
  from: '1.2.0',
  to: '1.3.0',
})

type CheckResult = Awaited<ReturnType<typeof checkModUpdates>>
const NONE: CheckResult = { code: 0, updated: null, releases: [] }
const repinned = (head: string): CheckResult => ({
  code: 0,
  updated: [entry(head)],
  releases: [release(head)],
})

interface Fakes {
  openPr?: number | null
  /** What the check finds, by the branch whose curation file it read. */
  checks?: Record<string, CheckResult>
  claude?: ClaudeRun
  diff?: string | Error
}

function run({
  openPr = null,
  checks = {},
  claude = { exitCode: 0, stdout: 'Verdict: no concerns', stderr: '' },
  diff = '+change',
}: Fakes) {
  const calls: string[] = []
  const prs: { title?: string; number?: number; body: string }[] = []
  const deps: OpenPrDeps = {
    findOpenPr: async () => openPr,
    readCuration: async (branch) => JSON.stringify([{ branch }]),
    check: async (raw, log) => {
      const branch = (raw as { branch: string }[])[0]?.branch ?? ''
      calls.push(`check:${branch}`)
      log('ahead deck: version unchanged (0.4.12), not re-pinned')
      return checks[branch] ?? NONE
    },
    diff: async () => {
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
      prs.push({ title, body })
      return 'https://github.com/NathanAB/statuslin.es/pull/200'
    },
    editPr: async (number, body) => {
      prs.push({ number, body })
    },
    log: () => {},
  }
  return { result: openModUpdatesPr(deps), calls, prs }
}

const formatted = (head: string) => `${JSON.stringify([entry(head)], null, 2)}\n`

describe('openModUpdatesPr', () => {
  it('opens nothing when no mod has a new release', async () => {
    const { result, calls, prs } = run({})

    expect(await result).toBe(0)
    expect(calls).toEqual(['check:main'])
    expect(prs).toEqual([])
  })

  it('re-pins on a fresh branch from main and opens one pull request with each review', async () => {
    const { result, calls, prs } = run({ checks: { main: repinned(HEAD) } })

    expect(await result).toBe(0)
    expect(calls).toEqual(['check:main', 'claude', `commit:fresh:${formatted(HEAD)}`])
    expect(prs).toHaveLength(1)
    expect(prs[0]?.title).toBe(TITLE)
    expect(prs[0]?.body).toContain('```text\nVerdict: no concerns\n```')
    expect(prs[0]?.body).toContain('ahead deck: version unchanged')
  })

  it('adds to the open pull request instead of opening another, reviewing from main’s pins', async () => {
    const { result, calls, prs } = run({
      openPr: 7,
      checks: { [BRANCH]: repinned(NEWER), main: repinned(NEWER) },
    })

    expect(await result).toBe(0)
    expect(calls).toEqual([
      `check:${BRANCH}`,
      'check:main',
      'claude',
      `commit:on top:${formatted(NEWER)}`,
    ])
    expect(prs).toEqual([{ number: 7, body: expect.stringContaining(`${PIN}...${NEWER}`) }])
  })

  it('leaves the open pull request alone when nothing was released since', async () => {
    const { result, calls, prs } = run({ openPr: 7, checks: { main: repinned(HEAD) } })

    expect(await result).toBe(0)
    expect(calls).toEqual([`check:${BRANCH}`])
    expect(prs).toEqual([])
  })

  it.each([
    ['a failed claude call', { claude: { exitCode: 1, stdout: '', stderr: 'expired' } }],
    ['an unreadable diff', { diff: new Error('git clone failed') }],
  ])(
    'still re-pins and opens the pull request after %s, marked not reviewed',
    async (_name, fakes) => {
      const { result, calls, prs } = run({ checks: { main: repinned(HEAD) }, ...fakes })

      expect(await result).toBe(0)
      expect(calls).toContain(`commit:fresh:${formatted(HEAD)}`)
      expect(prs[0]?.body).toContain('**Not reviewed** by an agent.')
    },
  )

  it('never lets a review decide: a mod with concerns is still in the pull request', async () => {
    const claude = {
      exitCode: 0,
      stdout: 'Verdict: concerns\nhook.sh:1 exec: runs curl',
      stderr: '',
    }
    const { calls, prs, result } = run({ checks: { main: repinned(HEAD) }, claude })

    await result
    expect(calls).toContain(`commit:fresh:${formatted(HEAD)}`)
    expect(prs[0]?.body).toContain('Verdict: concerns')
  })

  it('stops on a curation file the check refuses, writing nothing', async () => {
    const { result, calls, prs } = run({ checks: { main: { ...NONE, code: 1 } } })

    expect(await result).toBe(1)
    expect(calls).toEqual(['check:main'])
    expect(prs).toEqual([])
  })
})
