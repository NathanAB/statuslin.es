import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CURATION_FILE } from '@/mods/curation'
import type { CommitComparison } from '@/mods/github'
import {
  type CheckUpdatesDeps,
  checkModUpdates,
  formatCuration,
} from '../../scripts/check-mod-updates'

const REPO = 'https://github.com/octocat/meters'
const PIN = 'a'.repeat(40)
const HEAD = 'b'.repeat(40)
const FILE = 'src/mods/curation.json'

const entry = (overrides: Record<string, unknown> = {}) => ({
  repoUrl: REPO,
  path: 'plugins/meter',
  commitSha: PIN,
  pluginName: 'meter',
  title: 'Meter',
  ...overrides,
})

interface Fakes {
  head?: string
  comparison?: CommitComparison
  /** plugin.json versions by `<path>@<sha>`; a missing key reads as no version. */
  versions?: Record<string, string>
}

function run(raw: unknown, { head = HEAD, comparison = 'ahead', versions = {} }: Fakes = {}) {
  const calls: string[] = []
  const lines: string[] = []
  const github: CheckUpdatesDeps['github'] = {
    async repoInfo(repoUrl) {
      calls.push(`repoInfo:${repoUrl}`)
      return { fullName: 'octocat/meters', license: 'MIT', defaultBranch: 'trunk' }
    },
    async resolveCommit(_repoUrl, ref) {
      return ref === 'trunk' ? head : null
    },
    async compareCommits(_repoUrl, base, compared) {
      calls.push(`compare:${base.slice(0, 1)}...${compared.slice(0, 1)}`)
      return comparison
    },
    async pluginVersion(_repoUrl, path, sha) {
      return versions[`${path}@${sha}`] ?? null
    },
  }
  const result = checkModUpdates(raw, { github, log: (line) => lines.push(line), file: FILE })
  return { result, calls, lines }
}

describe('checkModUpdates', () => {
  it('re-pins an entry whose default branch has a new plugin.json version', async () => {
    const { result, lines } = run([entry()], {
      versions: { [`plugins/meter@${PIN}`]: '1.2.0', [`plugins/meter@${HEAD}`]: '1.3.0' },
    })

    expect(await result).toEqual({ code: 0, updated: [entry({ commitSha: HEAD })] })
    expect(lines).toEqual([
      `release meter 1.2.0 -> 1.3.0: ${REPO}/compare/${PIN}...${HEAD}`,
      `1 release(s) re-pinned in ${FILE}: review each compare link, merge it, then run bun run with-env staging scripts/run-repin-mods.ts staging`,
    ])
  })

  it('calls a pin without a version unversioned', async () => {
    const { result, lines } = run([entry()], { versions: { [`plugins/meter@${HEAD}`]: '1.0.0' } })

    expect((await result).updated).toEqual([entry({ commitSha: HEAD })])
    expect(lines[0]).toBe(`release meter unversioned -> 1.0.0: ${REPO}/compare/${PIN}...${HEAD}`)
  })

  it('leaves an entry whose new commits keep the same version', async () => {
    const { result, lines } = run([entry()], {
      versions: { [`plugins/meter@${PIN}`]: '1.2.0', [`plugins/meter@${HEAD}`]: '1.2.0' },
    })

    expect(await result).toEqual({ code: 0, updated: null })
    expect(lines).toEqual([
      'ahead meter: version unchanged (1.2.0), not re-pinned',
      'no new releases',
    ])
  })

  it('leaves an entry with no version at the head of its default branch', async () => {
    const { result, lines } = run([entry()], { versions: { [`plugins/meter@${PIN}`]: '1.2.0' } })

    expect(await result).toEqual({ code: 0, updated: null })
    expect(lines[0]).toBe('ahead meter: plugin.json has no version at trunk, not re-pinned')
  })

  it.each(['behind', 'diverged'] as const)(
    'leaves an entry whose default branch is %s its pin',
    async (comparison) => {
      const { result, lines } = run([entry()], {
        comparison,
        versions: { [`plugins/meter@${HEAD}`]: '9.0.0' },
      })

      expect(await result).toEqual({ code: 0, updated: null })
      expect(lines).toEqual([
        'diverged meter: trunk no longer builds on aaaaaaa, not re-pinned',
        'no new releases',
      ])
    },
  )

  it('says nothing about an entry pinned at its head, and compares nothing', async () => {
    const { result, lines, calls } = run([entry()], { head: PIN })

    expect(await result).toEqual({ code: 0, updated: null })
    expect(lines).toEqual(['no new releases'])
    expect(calls.filter((call) => call.startsWith('compare'))).toEqual([])
  })

  it('changes only the commit, keeping every other field and the key order', async () => {
    const steps = [{ type: 'text', text: '/meter', submit: false }]
    const raw = [
      {
        title: 'Meter',
        commitSha: PIN,
        inputSteps: steps,
        pluginName: 'meter',
        path: '',
        repoUrl: REPO,
      },
    ]
    const { result } = run(raw, {
      versions: { [`@${PIN}`]: '1.2.0', [`@${HEAD}`]: '1.3.0' },
    })

    const { updated } = await result
    expect(JSON.stringify(updated)).toBe(JSON.stringify([{ ...raw[0], commitSha: HEAD }]))
    expect(raw[0]?.commitSha).toBe(PIN)
  })

  it('reads a repository once for the several mods it holds', async () => {
    const { result, calls } = run(
      [
        entry(),
        entry({ path: 'plugins/gauge', pluginName: 'gauge' }),
        entry({ repoUrl: 'https://github.com/octocat/other', pluginName: 'other' }),
      ],
      { head: PIN },
    )

    await result
    expect(calls).toEqual([`repoInfo:${REPO}`, 'repoInfo:https://github.com/octocat/other'])
  })

  it('refuses an invalid curation file without reading GitHub or writing anything', async () => {
    const { result, lines, calls } = run([entry({ commitSha: 'main' })])

    expect(await result).toEqual({ code: 1, updated: null })
    expect(lines).toEqual([
      'refused entry 1 (meter) commitSha: must be a full 40-character lowercase hex commit SHA',
      'nothing re-pinned: fix the curation file first',
    ])
    expect(calls).toEqual([])
  })
})

describe('formatCuration', () => {
  it('writes the committed curation file back byte for byte', () => {
    const text = readFileSync(CURATION_FILE, 'utf8')

    expect(formatCuration(JSON.parse(text))).toBe(text)
  })
})
