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
  /** Repositories GitHub no longer serves. */
  goneRepos?: string[]
  /** Commits GitHub no longer serves. */
  goneCommits?: string[]
  /** Commits whose plugin folder has no plugin.json. */
  noManifest?: string[]
  /** plugin.json versions by `<path>@<sha>`; a missing key reads as no version. */
  versions?: Record<string, string>
}

function run(
  raw: unknown,
  {
    head = HEAD,
    comparison = 'ahead',
    goneRepos = [],
    goneCommits = [],
    noManifest = [],
    versions = {},
  }: Fakes = {},
) {
  const calls: string[] = []
  const lines: string[] = []
  const github: CheckUpdatesDeps['github'] = {
    async findRepo(repoUrl) {
      calls.push(`findRepo:${repoUrl}`)
      if (goneRepos.includes(repoUrl)) return null
      return { fullName: 'octocat/meters', license: 'MIT', defaultBranch: 'trunk' }
    },
    async commitIsFetchable(_repoUrl, sha) {
      return !goneCommits.includes(sha)
    },
    async resolveCommit(_repoUrl, ref) {
      return ref === 'trunk' ? head : null
    },
    async compareCommits(_repoUrl, base, compared) {
      calls.push(`compare:${base.slice(0, 1)}...${compared.slice(0, 1)}`)
      return comparison
    },
    async pluginManifestExists(_repoUrl, _path, sha) {
      return !noManifest.includes(sha)
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
    expect(lines.slice(0, 2)).toEqual([
      `release meter: ${REPO}/compare/${PIN}...${HEAD} (1.2.0 -> 1.3.0)`,
      `1 release(s) re-pinned in ${FILE}: review each compare link, merge it, then run bun run with-env staging scripts/run-repin-mods.ts staging`,
    ])
  })

  it('calls a pin without a version unversioned', async () => {
    const { result, lines } = run([entry()], { versions: { [`plugins/meter@${HEAD}`]: '1.0.0' } })

    expect((await result).updated).toEqual([entry({ commitSha: HEAD })])
    expect(lines[0]).toBe(`release meter: ${REPO}/compare/${PIN}...${HEAD} (unversioned -> 1.0.0)`)
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

  // Claude Code versions a plugin without one by its commit, so every commit reaches installs.
  it.each([
    ['has no version', {}],
    ['dropped its version', { [`plugins/meter@${PIN}`]: '1.2.0' }],
  ])('re-pins every new commit of a mod that %s', async (_case, versions) => {
    const { result, lines } = run([entry()], { versions })

    expect((await result).updated).toEqual([entry({ commitSha: HEAD })])
    expect(lines[0]).toBe(
      `release meter: ${REPO}/compare/${PIN}...${HEAD} (no version, so every commit updates installs)`,
    )
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

  it('lists a repository GitHub no longer serves and checks the rest', async () => {
    const other = 'https://github.com/octocat/other'
    const { result, lines } = run([entry(), entry({ repoUrl: other, pluginName: 'other' })], {
      goneRepos: [REPO],
      versions: { [`plugins/meter@${HEAD}`]: '2.0.0' },
    })

    expect(await result).toEqual({
      code: 0,
      updated: [entry(), entry({ repoUrl: other, pluginName: 'other', commitSha: HEAD })],
    })
    expect(lines[0]).toBe(
      `gone meter: GitHub no longer serves ${REPO} (deleted or private), not re-pinned`,
    )
    expect(lines[1]).toMatch(/^release other: /)
  })

  it('lists a pin GitHub no longer serves without comparing it', async () => {
    const { result, lines, calls } = run([entry()], { goneCommits: [PIN] })

    expect(await result).toEqual({ code: 0, updated: null })
    expect(lines[0]).toBe('gone meter: GitHub no longer serves the pinned aaaaaaa, not re-pinned')
    expect(calls.filter((call) => call.startsWith('compare'))).toEqual([])
  })

  it('ends with a table for the curation pull request, the compare link first', async () => {
    const { result, lines } = run([entry(), entry({ path: '', pluginName: 'gauge' })], {
      versions: {
        [`plugins/meter@${PIN}`]: '1.2.0',
        [`plugins/meter@${HEAD}`]: '1.3.0-beta.1+build.5',
        [`@${HEAD}`]: '2.0.0',
      },
    })

    await result
    expect(lines.slice(-4)).toEqual([
      '| Mod | Folder | Changes since the pin | Version |',
      '| --- | --- | --- | --- |',
      `| meter | \`plugins/meter\` | ${REPO}/compare/${PIN}...${HEAD} | \`1.2.0\` → \`1.3.0-beta.1+build.5\` |`,
      `| gauge | the repository root | ${REPO}/compare/${PIN}...${HEAD} | unversioned → \`2.0.0\` |`,
    ])
  })

  // The author writes the version; past a plain version it could push the real link out of view.
  it.each([
    [
      'a sentence with a link',
      '0.2.0 reviewed, safe to merge; see https://github.com/o/r/compare/x...y',
    ],
    ['a long string', `1.0.0${'0'.repeat(80)}`],
  ])(
    'leaves a mod whose version at the head is %s, without printing it',
    async (_case, version) => {
      const { result, lines } = run([entry()], {
        versions: { [`plugins/meter@${PIN}`]: '1.2.0', [`plugins/meter@${HEAD}`]: version },
      })

      expect(await result).toEqual({ code: 0, updated: null })
      expect(lines).toEqual([
        "unreadable meter: plugin.json's version at trunk is not a plain version, not re-pinned: read it by hand",
        'no new releases',
      ])
    },
  )

  it('lists a mod whose plugin.json is gone at the head instead of re-pinning it', async () => {
    const { result, lines } = run([entry()], {
      noManifest: [HEAD],
      versions: { [`plugins/meter@${PIN}`]: '1.2.0' },
    })

    expect(await result).toEqual({ code: 0, updated: null })
    expect(lines[0]).toBe('gone meter: trunk has no plugin.json in plugins/meter, not re-pinned')
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
    expect(calls).toEqual([`findRepo:${REPO}`, 'findRepo:https://github.com/octocat/other'])
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
