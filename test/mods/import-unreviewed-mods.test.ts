import { readFileSync } from 'node:fs'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import type { RepoInfo } from '@/mods/github'
import { PluginRefusal } from '@/mods/plugin-facts'
import { importUnreviewedMods, type UnreviewedImportDeps } from '@/mods/unreviewed-import'
import type { ModSandbox, ModSource } from '@/render/mods/mod-sandbox'
import { addMod, addVersion, MODULES_ONLY_LISTING, openTestDb, sha, type TestDb } from './seed-mods'

const SHA = sha('c')
const NEW_SHA = sha('d')
const REPO = 'https://github.com/OctoCat/meter'
const VALIDATE_OUTPUT = readFileSync(
  new URL('./fixtures/validate-skins.json', import.meta.url),
  'utf8',
)

let db: TestDb
let close: () => Promise<void>

beforeAll(async () => {
  ;({ db, close } = await openTestDb())
  await db.insert(schema.user).values({ id: 'ada', name: 'Ada', email: 'ada@test.com' })
})
beforeEach(async () => {
  await db.delete(schema.unreviewedMods)
  await db.delete(schema.mods)
})
afterAll(async () => {
  await close()
})

const entry = (overrides: Record<string, unknown> = {}) => ({
  repoUrl: REPO,
  path: 'plugins/meter',
  commitSha: SHA,
  pluginName: 'meter',
  ...overrides,
})

interface Fakes {
  repo?: RepoInfo | null
  manifestName?: string
  sandboxError?: Error
  onDefaultBranch?: boolean
}

function fakes({
  repo = { fullName: 'OctoCat/meter', license: 'MIT', defaultBranch: 'main', stars: 12 },
  manifestName = 'meter',
  sandboxError,
  onDefaultBranch = true,
}: Fakes = {}) {
  const calls: string[] = []
  const github: UnreviewedImportDeps['github'] = {
    async findRepo(repoUrl) {
      calls.push(`findRepo:${repoUrl}`)
      return repo
    },
    async commitIsOnDefaultBranch(_repoUrl, commit, defaultBranch) {
      calls.push(`onDefaultBranch:${commit}:${defaultBranch}`)
      return onDefaultBranch
    },
    async commitDate(_repoUrl, commit) {
      calls.push(`commitDate:${commit}`)
      return new Date('2026-11-01T09:30:00Z')
    },
  }
  const fetchPlugin: UnreviewedImportDeps['fetchPlugin'] = async ({ commitSha }) => {
    calls.push(`fetch:${commitSha}`)
    return new Uint8Array([31, 139, 8, 0])
  }
  const manifest = { name: manifestName, version: '0.3.0', description: 'A token meter.' }
  const answers: [(command: string) => boolean, string][] = [
    [(c) => c.endsWith('--version'), '2.1.296 (Claude Code)\n'],
    [(c) => c.includes(' plugin validate --json '), VALIDATE_OUTPUT],
    [(c) => c.endsWith('/.claude-plugin/plugin.json'), JSON.stringify(manifest)],
    [(c) => c.includes('hooks/hooks.json'), MODULES_ONLY_LISTING],
  ]
  const sandbox: ModSandbox = {
    pluginDir: '/home/user/plugins/mod',
    async run(command) {
      const stdout = answers.find(([matches]) => matches(command))?.[1] ?? ''
      return { exitCode: stdout ? 0 : 127, stdout, stderr: '' }
    },
  }
  async function withSandbox<T>(_source: ModSource, use: (s: ModSandbox) => Promise<T>) {
    if (sandboxError) throw sandboxError
    return use(sandbox)
  }
  return { calls, github, fetchPlugin, withSandbox }
}

async function run(file: unknown, deps = fakes()) {
  const lines: string[] = []
  const exitCode = await importUnreviewedMods(file, {
    db,
    ...deps,
    log: (line) => lines.push(line),
  })
  return { exitCode, lines, calls: deps.calls }
}

const rows = () => db.select().from(schema.unreviewedMods)

/** A mod row holding the folder the default entry pins, as a curated or submitted mod would. */
async function holdFolder(status: schema.ModStatus) {
  const modId = await addMod(db, 'meter', status)
  return addVersion(db, modId, {
    commitSha: sha('b'),
    versionNumber: 1,
    repoUrl: REPO,
    path: 'plugins/meter',
    rendered: false,
  })
}

describe('importUnreviewedMods', () => {
  it('stores what the page shows from GitHub and the sandbox', async () => {
    const { exitCode, lines } = await run([entry()])

    expect(exitCode).toBe(0)
    expect(lines).toEqual([`imported OctoCat/meter at ${SHA}`])
    const [row] = await rows()
    expect(row).toMatchObject({
      owner: 'OctoCat',
      pluginName: 'meter',
      description: 'A token meter.',
      repoUrl: REPO,
      path: 'plugins/meter',
      commitSha: SHA,
      committedAt: new Date('2026-11-01T09:30:00Z'),
      pluginVersion: '0.3.0',
      license: 'MIT',
      stars: 12,
      validatedWith: '2.1.296',
    })
    expect(row?.footprint.events).toContain('ui.render{component=AbovePrompt}')
  })

  it('changes nothing and asks nothing on a second run of the same file', async () => {
    await run([entry()])
    const before = await rows()

    const second = await run([entry()])

    expect(second.exitCode).toBe(0)
    expect(second.calls).toEqual([])
    expect(second.lines).toEqual([`unchanged OctoCat/meter at ${SHA}`])
    expect(await rows()).toEqual(before)
  })

  it('replaces the row when the entry pins a new commit', async () => {
    await run([entry()])

    const { lines } = await run([entry({ commitSha: NEW_SHA })])

    expect(lines).toEqual([`imported OctoCat/meter at ${NEW_SHA}`])
    expect((await rows()).map((row) => row.commitSha)).toEqual([NEW_SHA])
  })

  it('deletes the row of an entry that left the file', async () => {
    await run([entry(), entry({ pluginName: 'other', path: 'plugins/other' })], fakes())
    // The fake plugin.json names "meter", so only the first entry is in the table.
    expect((await rows()).map((row) => row.pluginName)).toEqual(['meter'])

    const { exitCode, lines } = await run([])

    expect(exitCode).toBe(0)
    expect(lines).toEqual(['deleted OctoCat/meter: its entry left the file'])
    expect(await rows()).toEqual([])
  })

  it('refuses an entry whose plugin.json names another plugin, and imports the rest', async () => {
    const { exitCode, lines } = await run(
      [entry({ pluginName: 'other', path: 'plugins/other' }), entry()],
      fakes(),
    )

    expect(exitCode).toBe(1)
    expect(lines).toEqual([
      'refused other: plugin.json names the plugin "meter", not "other"',
      `imported OctoCat/meter at ${SHA}`,
    ])
    expect((await rows()).map((row) => row.pluginName)).toEqual(['meter'])
  })

  it('refuses a private repository, which GitHub does not serve', async () => {
    const { exitCode, lines, calls } = await run([entry()], fakes({ repo: null }))

    expect(exitCode).toBe(1)
    expect(lines).toEqual([
      `refused meter: GitHub does not serve ${REPO}; a private repository gets no page`,
    ])
    expect(calls).toEqual([`findRepo:${REPO}`])
    expect(await rows()).toEqual([])
  })

  it('refuses a commit off the default branch before fetching it, as a fork could serve it', async () => {
    const { exitCode, lines, calls } = await run([entry()], fakes({ onDefaultBranch: false }))

    expect(exitCode).toBe(1)
    expect(lines).toEqual([
      `refused meter: commit ${SHA} is not on the repository's default branch (main)`,
    ])
    expect(calls).toEqual([`findRepo:${REPO}`, `onDefaultBranch:${SHA}:main`])
    expect(await rows()).toEqual([])
  })

  it('refuses a repository URL not written as GitHub spells it', async () => {
    const { lines } = await run([entry({ repoUrl: 'https://github.com/octocat/meter' })])

    expect(lines).toEqual([
      'refused meter: write the repository URL as https://github.com/OctoCat/meter',
    ])
    expect(await rows()).toEqual([])
  })

  it('refuses a plugin that fails the inspection a submitted mod passes', async () => {
    const deps = fakes({ sandboxError: new PluginRefusal('claude plugin validate failed: bad') })

    const { exitCode, lines } = await run([entry()], deps)

    expect(exitCode).toBe(1)
    expect(lines).toEqual(['refused meter: claude plugin validate failed: bad'])
    expect(await rows()).toEqual([])
  })

  it('refuses the folder of a mod statuslin.es removed, without asking GitHub', async () => {
    await holdFolder('removed')

    const { exitCode, lines, calls } = await run([entry()])

    expect(exitCode).toBe(1)
    expect(lines).toEqual(['refused meter: statuslin.es removed this mod'])
    expect(calls).toEqual([])
    expect(await rows()).toEqual([])
  })

  it('refuses the folder of a rejected submission, and drops the page it had', async () => {
    await run([entry()])
    const versionId = await holdFolder('draft')
    await db.insert(schema.submissions).values({
      id: versionId,
      kind: 'mod',
      modVersionId: versionId,
      submittedBy: 'ada',
      status: 'rejected',
    })

    const { exitCode, lines } = await run([entry()])

    expect(exitCode).toBe(1)
    expect(lines).toEqual([
      'refused meter: statuslin.es rejected a submission of this mod',
      'deleted OctoCat/meter: its entry left the file',
    ])
    expect(await rows()).toEqual([])
  })

  it('does not refuse a folder whose submission is only pending', async () => {
    const versionId = await holdFolder('draft')
    await db.insert(schema.submissions).values({
      id: versionId,
      kind: 'mod',
      modVersionId: versionId,
      submittedBy: 'ada',
      status: 'pending',
    })

    expect((await run([entry()])).exitCode).toBe(0)
  })

  it('writes nothing when the file is malformed', async () => {
    await run([entry()])

    const { exitCode, lines } = await run([entry({ commitSha: 'abc' })])

    expect(exitCode).toBe(1)
    expect(lines.at(-1)).toBe('nothing imported: fix src/mods/unreviewed.json first')
    expect(await rows()).toHaveLength(1)
  })

  it('makes a refusal quoting the plugin safe for the terminal', async () => {
    const deps = fakes({ sandboxError: new PluginRefusal('bad name \u001b[2J here') })

    const { lines } = await run([entry()], deps)

    expect(lines).toHaveLength(1)
    expect(lines[0]).not.toContain('\u001b')
  })
})

it('keeps a row only for the plugin it names', async () => {
  await run([entry()])
  const [row] = await rows()

  await db
    .update(schema.unreviewedMods)
    .set({ pluginName: 'renamed' })
    .where(eq(schema.unreviewedMods.id, row?.id ?? ''))
  const { lines } = await run([entry()])

  expect(lines).toEqual([
    `imported OctoCat/meter at ${SHA}`,
    'deleted OctoCat/renamed: its entry left the file',
  ])
})
