import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import type { CurationEntry } from '@/mods/curation'
import { insertPendingSubmission } from '@/submissions/record'
import {
  assertAppEnv,
  assertCurationReviewed,
  type Repin,
  type RepinIo,
  type RepinSteps,
  repinsToRun,
  runRepin,
} from '../../scripts/repin-mods'
import {
  addMod,
  addVersion,
  openTestDb,
  REPO_URL,
  setCurrentVersion,
  sha,
  type TestDb,
} from './seed-mods'

let db: TestDb
let close: () => Promise<void>

beforeAll(async () => {
  ;({ db, close } = await openTestDb())
})
beforeEach(async () => {
  await db.delete(schema.mods)
})
afterAll(async () => {
  await close()
})

describe('assertAppEnv', () => {
  it('passes when APP_ENV is the env named on the command line', () => {
    expect(() => assertAppEnv('staging', 'staging')).not.toThrow()
  })

  it.each([
    ['another env', 'production'],
    ['no env', undefined],
  ])('refuses %s', (_name, appEnv) => {
    expect(() => assertAppEnv('staging', appEnv)).toThrow(/APP_ENV/)
  })
})

// updates:mods moves pins in the working copy; only the reviewed, merged file may go live.
describe('assertCurationReviewed', () => {
  it('passes when the curation file is the one on main', () => {
    expect(() => assertCurationReviewed('[1]\n', '[1]\n')).not.toThrow()
  })

  it.each([
    ['differs from main', '[2]\n'],
    ['is not on main', null],
  ])('refuses a curation file that %s', (_case, onMain) => {
    expect(() => assertCurationReviewed('[1]\n', onMain)).toThrow(
      /src\/mods\/curation\.json is not the reviewed one on origin\/main/,
    )
  })
})

const entry = (pluginName: string, commitSha: string): CurationEntry => ({
  repoUrl: REPO_URL,
  path: '',
  commitSha,
  pluginName,
  title: pluginName,
  inputSteps: [],
})

async function liveMod(slug: string, commitSha: string, status: schema.ModStatus = 'published') {
  const modId = await addMod(db, slug, status)
  const versionId = await addVersion(db, modId, { commitSha, versionNumber: 1 })
  await setCurrentVersion(db, modId, versionId)
  return versionId
}

describe('repinsToRun', () => {
  it('lists every published curated mod whose pinned commit is not the live one', async () => {
    await liveMod('meter', sha('a'))
    await liveMod('gauge', sha('b'))
    const entries = [entry('meter', sha('c')), entry('gauge', sha('b'))]

    expect(await repinsToRun(db, entries, [])).toEqual([{ slug: 'meter', commitSha: sha('c') }])
  })

  it('leaves out new entries, drafts, delisted mods and mods a user submitted', async () => {
    await liveMod('draft', sha('a'), 'draft')
    await liveMod('gone', sha('a'), 'removed')
    await db
      .insert(schema.user)
      .values({ id: 'ada', name: 'Ada', email: 'ada@test.com' })
      .onConflictDoNothing()
    const versionId = await liveMod('theirs', sha('a'))
    await insertPendingSubmission(db, { kind: 'mod', versionId, submittedBy: 'ada' })
    const entries = ['fresh', 'draft', 'gone', 'theirs'].map((name) => entry(name, sha('c')))

    expect(await repinsToRun(db, entries, [])).toEqual([])
  })

  it('keeps only the slugs named', async () => {
    await liveMod('meter', sha('a'))
    await liveMod('gauge', sha('b'))
    const entries = [entry('meter', sha('c')), entry('gauge', sha('d'))]

    expect(await repinsToRun(db, entries, ['gauge'])).toEqual([
      { slug: 'gauge', commitSha: sha('d') },
    ])
  })

  it('refuses a named slug with nothing to re-pin', async () => {
    await liveMod('meter', sha('a'))

    await expect(repinsToRun(db, [entry('meter', sha('a'))], ['meter'])).rejects.toThrow(/meter/)
    await expect(repinsToRun(db, [entry('meter', sha('a'))], ['nope'])).rejects.toThrow(/nope/)
  })
})

const REPINS: Repin[] = [
  { slug: 'meter', commitSha: sha('c') },
  { slug: 'gauge', commitSha: sha('d') },
]

function fakes(
  input: string[],
  { failing = '', requests = '[{"slug":"meter"}]' }: { failing?: string; requests?: string } = {},
) {
  const calls: string[] = []
  const lines: string[] = []
  const sent: string[] = []
  const prompts: string[] = []
  const steps: RepinSteps = {
    importMods: async () => {
      calls.push('import')
      return failing === 'import' ? 1 : 0
    },
    renderMod: async (slug) => {
      calls.push(`render ${slug}`)
      return failing === `render ${slug}` ? 1 : 0
    },
    publishMod: async (argv, log) => {
      calls.push(`publish ${argv.join(' ')}`)
      log(`report for ${argv[0]}`)
      if (!argv.includes('--apply')) log(`WARN version: ${argv[0]} kept its version`)
      return failing === `publish ${argv[0]}` ? 1 : 0
    },
    prepareContent: async () => {
      calls.push('prepare')
      return requests
    },
    applyContent: async (responses) => {
      calls.push(`apply ${responses}`)
    },
    renderStatusLineDesktop: async () => {
      calls.push('desktop shots')
      return failing === 'desktop shots' ? 1 : 0
    },
  }
  const io: RepinIo = {
    log: (line) => lines.push(line),
    sendRequests: async (json) => {
      sent.push(json)
    },
    readInput: async (prompt) => {
      prompts.push(prompt)
      return input.shift() ?? ''
    },
  }
  return { steps, io, calls, lines, sent, prompts }
}

describe('runRepin', () => {
  it('imports, renders, dry-runs, publishes on the typed confirmation, then applies page copy', async () => {
    const f = fakes(['publish 2 to staging\n', '[{"slug":"meter","summary":"x"}]'])

    const code = await runRepin('staging', REPINS, f.steps, f.io)

    expect(code).toBe(0)
    expect(f.calls).toEqual([
      'import',
      'render meter',
      'render gauge',
      `publish meter ${sha('c')}`,
      `publish gauge ${sha('d')}`,
      `publish meter ${sha('c')} --apply --confirm=meter`,
      `publish gauge ${sha('d')} --apply --confirm=gauge`,
      'prepare',
      'apply [{"slug":"meter","summary":"x"}]',
    ])
    expect(f.sent).toEqual(['[{"slug":"meter"}]'])
    expect(f.prompts[0]).toMatch(/publish 2 to staging/)
  })

  it('repeats the dry runs WARN lines before asking', async () => {
    const f = fakes([''])

    await runRepin('staging', REPINS, f.steps, f.io)

    const warnings = f.lines.slice(f.lines.indexOf('report for gauge') + 2)
    expect(warnings).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/meter: WARN version/),
        expect.stringMatching(/gauge: WARN version/),
      ]),
    )
  })

  it.each([
    ['nothing typed', ''],
    ['the wrong env', 'publish 2 to production'],
    ['the wrong count', 'publish 1 to staging'],
  ])('publishes nothing on %s', async (_name, typed) => {
    const f = fakes([typed])

    const code = await runRepin('staging', REPINS, f.steps, f.io)

    expect(code).toBe(1)
    expect(f.calls.some((c) => c.includes('--apply'))).toBe(false)
    expect(f.calls).not.toContain('prepare')
  })

  it.each([
    ['the import', 'import'],
    ['a render', 'render meter'],
    ['a dry run', 'publish gauge'],
  ])('stops before publishing when %s fails', async (_name, failing) => {
    const f = fakes(['publish 2 to staging'], { failing })

    const code = await runRepin('staging', REPINS, f.steps, f.io)

    expect(code).toBe(1)
    expect(f.prompts).toEqual([])
    expect(f.calls.some((c) => c.includes('--apply'))).toBe(false)
  })

  it('skips the page copy when no mod is missing it', async () => {
    const f = fakes(['publish 2 to staging'], { requests: '[]' })

    const code = await runRepin('staging', REPINS, f.steps, f.io)

    expect(code).toBe(0)
    expect(f.sent).toEqual([])
    expect(f.calls.at(-1)).toBe('prepare')
  })

  it('does nothing when there is nothing to re-pin', async () => {
    const f = fakes([])

    expect(await runRepin('staging', [], f.steps, f.io)).toBe(0)
    expect(f.calls).toEqual([])
  })

  describe('when statusline-anywhere is re-pinned', () => {
    const WITH_ANYWHERE: Repin[] = [
      { slug: 'meter', commitSha: sha('c') },
      { slug: 'statusline-anywhere', commitSha: sha('e') },
    ]

    it('re-records the status line Desktop shots last', async () => {
      const f = fakes(['publish 2 to staging', '[{"slug":"meter","summary":"x"}]'])

      const code = await runRepin('staging', WITH_ANYWHERE, f.steps, f.io)

      expect(code).toBe(0)
      expect(f.calls.at(-1)).toBe('desktop shots')
      expect(f.calls.filter((c) => c === 'desktop shots')).toHaveLength(1)
    })

    it('re-records them when no mod needs page copy', async () => {
      const f = fakes(['publish 2 to staging'], { requests: '[]' })

      expect(await runRepin('staging', WITH_ANYWHERE, f.steps, f.io)).toBe(0)
      expect(f.calls.at(-1)).toBe('desktop shots')
    })

    it('exits 1 when a recording fails, after everything else ran', async () => {
      const f = fakes(['publish 2 to staging', '[]'], { failing: 'desktop shots' })

      expect(await runRepin('staging', WITH_ANYWHERE, f.steps, f.io)).toBe(1)
      expect(f.calls).toContain('prepare')
    })

    it('leaves them alone when nothing was published', async () => {
      const f = fakes(['no'])

      await runRepin('staging', WITH_ANYWHERE, f.steps, f.io)

      expect(f.calls).not.toContain('desktop shots')
    })
  })

  it('leaves the status line Desktop shots alone when statusline-anywhere is not re-pinned', async () => {
    const f = fakes(['publish 2 to staging', '[]'])

    await runRepin('staging', REPINS, f.steps, f.io)

    expect(f.calls).not.toContain('desktop shots')
  })
})
