import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import type { GitHubSource, RepoInfo } from '@/mods/github'
import type { ModSandbox, ModSource } from '@/render/mods/mod-sandbox'
import { importMods } from '../../scripts/import-mods'
import { addMod, openTestDb, type TestDb } from './seed-mods'

const SHA = 'c'.repeat(40)
const TARBALL = new Uint8Array([31, 139, 8, 0])
const VALIDATE_OUTPUT = readFileSync(
  new URL('./fixtures/validate-skins.json', import.meta.url),
  'utf8',
)

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

const entry = (overrides: Record<string, unknown> = {}) => ({
  repoUrl: 'https://github.com/hellosverre/claude-skins',
  path: '',
  commitSha: SHA,
  pluginName: 'skins',
  title: 'Skins',
  inputSteps: [{ type: 'text', text: '/skin', submit: false }],
  ...overrides,
})

interface Fakes {
  fullName?: string
  license?: string | null
  manifest?: Record<string, unknown>
}

function fakes({
  fullName = 'hellosverre/claude-skins',
  license = 'MIT',
  manifest = { name: 'skins', version: '1.4.0', description: 'Reskins Claude Code.' },
}: Fakes = {}) {
  const calls: string[] = []
  const github: GitHubSource = {
    async repoInfo(repoUrl): Promise<RepoInfo> {
      calls.push(`repoInfo:${repoUrl}`)
      return { fullName, license, defaultBranch: 'main' }
    },
    async tarball(repoUrl, sha) {
      calls.push(`tarball:${repoUrl}@${sha}`)
      return TARBALL
    },
  }
  const sandbox: ModSandbox = {
    pluginDir: '/home/user/plugins/mod',
    async run(command) {
      const stdout = command.endsWith('--version')
        ? '2.1.296 (Claude Code)\n'
        : command.includes(' plugin validate --json ')
          ? VALIDATE_OUTPUT
          : command.endsWith('/.claude-plugin/plugin.json')
            ? JSON.stringify(manifest)
            : ''
      return { exitCode: stdout ? 0 : 127, stdout, stderr: '' }
    },
  }
  async function withSandbox<T>(source: ModSource, use: (s: ModSandbox) => Promise<T>) {
    calls.push(`sandbox:${source.path || '(root)'}:${source.tarball.byteLength}`)
    return use(sandbox)
  }
  return { calls, github, withSandbox }
}

async function run(curation: unknown, deps = fakes()) {
  const lines: string[] = []
  const exitCode = await importMods(curation, { db, ...deps, log: (line) => lines.push(line) })
  return { exitCode, output: lines.join('\n'), calls: deps.calls }
}

const allMods = () => db.select().from(schema.mods)
const allVersions = () => db.select().from(schema.modVersions)

describe('importMods', () => {
  it('lands a clean entry as a draft mod with its first version', async () => {
    const { exitCode, calls } = await run([entry()])

    expect(exitCode).toBe(0)
    expect(calls).toEqual([
      'repoInfo:https://github.com/hellosverre/claude-skins',
      `tarball:https://github.com/hellosverre/claude-skins@${SHA}`,
      'sandbox:(root):4',
    ])
    const [mod] = await allMods()
    expect(mod).toMatchObject({
      slug: 'skins',
      pluginName: 'skins',
      title: 'Skins',
      description: 'Reskins Claude Code.',
      authorGithub: 'hellosverre',
      status: 'draft',
    })
    const [version] = await allVersions()
    expect(version).toMatchObject({
      modId: mod?.id,
      versionNumber: 1,
      repoUrl: 'https://github.com/hellosverre/claude-skins',
      path: '',
      commitSha: SHA,
      pluginVersion: '1.4.0',
      license: 'MIT',
      validatedWith: '2.1.296',
      inputSteps: [{ type: 'text', text: '/skin', submit: false }],
    })
    expect(version?.footprint.events).toContain('ui.render{component=AbovePrompt}')
    expect(version?.footprint.calls).toContain('$.ui.toast')
    expect(mod?.currentVersionId).toBe(version?.id)
  })

  it('records a missing plugin version and licence as null', async () => {
    await run([entry()], fakes({ license: null, manifest: { name: 'skins' } }))

    const [version] = await allVersions()
    expect(version).toMatchObject({ pluginVersion: null, license: null })
  })

  it('changes nothing on a second run with the same file', async () => {
    await run([entry()])
    const before = { mods: await allMods(), versions: await allVersions() }

    const second = await run([entry()])

    expect(second.exitCode).toBe(0)
    expect(second.calls).toEqual([])
    expect(second.output).toMatch(/skins.*already imported/)
    expect({ mods: await allMods(), versions: await allVersions() }).toEqual(before)
  })

  it('refuses a plugin name an existing mod already uses', async () => {
    const existingId = await addMod(db, 'skins', 'published')

    const { exitCode, output, calls } = await run([entry()])

    expect(exitCode).toBe(1)
    expect(output).toMatch(/"skins" is already used by mod "skins"/)
    expect(calls).toEqual([])
    expect((await allMods()).map((m) => m.id)).toEqual([existingId])
    expect(await allVersions()).toEqual([])
  })

  it('refuses a plugin.json whose name differs from the curation entry', async () => {
    const { exitCode, output } = await run([entry()], fakes({ manifest: { name: 'skin-pack' } }))

    expect(exitCode).toBe(1)
    expect(output).toMatch(/plugin\.json names the plugin "skin-pack", not "skins"/)
    expect(await allMods()).toEqual([])
  })

  it('refuses a repository URL that is not the canonical one GitHub reports', async () => {
    const { exitCode, output } = await run(
      [entry()],
      fakes({ fullName: 'HelloSverre/claude-skins' }),
    )

    expect(exitCode).toBe(1)
    expect(output).toMatch(/https:\/\/github\.com\/HelloSverre\/claude-skins/)
    expect(await allMods()).toEqual([])
  })

  it('keeps importing the other entries when one is refused', async () => {
    const curation = [
      entry({ pluginName: 'skin-pack', title: 'Skin Pack' }),
      entry({ path: 'other', pluginName: 'skins' }),
    ]

    const { exitCode } = await run(curation)

    expect(exitCode).toBe(1)
    expect((await allMods()).map((m) => m.slug)).toEqual(['skins'])
  })

  it('writes nothing and fetches nothing when any entry is invalid', async () => {
    const { exitCode, output, calls } = await run([
      entry(),
      entry({ pluginName: 'meter', commitSha: 'abc1234' }),
    ])

    expect(exitCode).toBe(1)
    expect(output).toMatch(/entry 2 \(meter\) commitSha/)
    expect(calls).toEqual([])
    expect(await allMods()).toEqual([])
  })

  it('downloads a repository once for entries that share its commit', async () => {
    const deps = fakes({ manifest: { name: 'skins' } })
    await run([entry({ path: 'a' }), entry({ path: 'b', pluginName: 'skins-2' })], deps)

    expect(deps.calls.filter((c) => c.startsWith('tarball:'))).toHaveLength(1)
  })
})
