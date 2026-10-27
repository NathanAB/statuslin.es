import { spawn, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { CommandExitError } from 'e2b'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PluginRefusal } from '@/mods/plugin-facts'
import { E2B_MOD_TEMPLATE_ID } from '@/render/e2b-template'

const fake = vi.hoisted(() => ({ create: vi.fn() }))

vi.mock('e2b', async (importOriginal) => {
  const actual = await importOriginal<typeof import('e2b')>()
  return { ...actual, Sandbox: { create: fake.create } }
})

import {
  createPluginFetcher,
  TARBALL_MAX_BYTES,
  TARBALL_MAX_FILES,
} from '@/render/mods/plugin-checkout'

const REPO = 'https://github.com/octocat/meter'

/** Keeps the developer's own git config out of the fixtures and the fetch. */
const ISOLATED_GIT = { GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' }

let root: string
/** Where the fake sandbox's `mktemp` makes its folders, so a test can look at what landed there. */
let sandboxTmp: string
let read: ReturnType<typeof vi.fn>

function git(cwd: string, ...args: string[]): string {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...ISOLATED_GIT },
  })
  if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`)
  return result.stdout.trim()
}

/**
 * Commits `files` (and gitlinks) to the fixture repository GitHub serves as REPO, and returns the
 * commit. `tag` returns an annotated tag of it instead.
 */
async function commit(
  files: Record<string, string | Uint8Array>,
  { gitlinks = [], tag = false }: { gitlinks?: string[]; tag?: boolean } = {},
): Promise<string> {
  const repo = join(root, 'github', 'octocat', 'meter')
  await mkdir(repo, { recursive: true })
  git(repo, 'init', '--quiet')
  for (const [path, data] of Object.entries(files)) {
    await mkdir(dirname(join(repo, path)), { recursive: true })
    await writeFile(join(repo, path), data)
  }
  git(repo, 'add', '--all')
  for (const path of gitlinks) {
    git(repo, 'update-index', '--add', '--cacheinfo', `160000,${'c'.repeat(40)},${path}`)
  }
  git(repo, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '--quiet', '-m', 'mod')
  // What github.com allows: fetching any commit by hash, without its blobs.
  git(repo, 'config', 'uploadpack.allowFilter', 'true')
  git(repo, 'config', 'uploadpack.allowAnySHA1InWant', 'true')
  if (!tag) return git(repo, 'rev-parse', 'HEAD')
  git(repo, '-c', 'user.name=t', '-c', 'user.email=t@t', 'tag', '-a', 'v1', '-m', 'v1')
  return git(repo, 'rev-parse', 'v1')
}

/** Runs each command on this machine, with github.com served from the fixture folder. */
function localSandbox() {
  const env = {
    ...process.env,
    ...ISOLATED_GIT,
    TMPDIR: sandboxTmp,
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: `url.file://${join(root, 'github')}/.insteadOf`,
    GIT_CONFIG_VALUE_0: 'https://github.com/',
  }
  read = vi.fn(async (path: string) => new Uint8Array(await readFile(path)))
  return {
    commands: {
      run: async (
        command: string,
        opts: { onStdout: (data: string) => void; onStderr: (data: string) => void },
      ) => {
        const child = spawn('sh', ['-c', command], { env })
        let stdout = ''
        let stderr = ''
        child.stdout.on('data', (data: Buffer) => {
          stdout += data.toString('latin1')
          opts.onStdout(data.toString('latin1'))
        })
        child.stderr.on('data', (data: Buffer) => {
          stderr += data
          opts.onStderr(String(data))
        })
        const exited = new Promise<number>((resolve) =>
          child.on('close', (code) => resolve(code ?? 1)),
        )
        return {
          wait: async () => {
            const exitCode = await exited
            if (exitCode === 0) return { exitCode, stdout, stderr }
            throw new CommandExitError({ exitCode, stdout, stderr, error: `exit ${exitCode}` })
          },
          kill: async () => child.kill(),
          disconnect: async () => {},
        }
      },
    },
    files: { read },
    kill: vi.fn(async () => {}),
  }
}

/** The member names of a `.tar.gz`. */
async function members(tarball: Uint8Array): Promise<string[]> {
  const file = join(root, 'out.tar.gz')
  await writeFile(file, tarball)
  const listed = spawnSync('tar', ['-tzf', file], { encoding: 'utf8' })
  return listed.stdout.split('\n').filter((name) => name !== '' && !name.endsWith('/'))
}

/** Files the checkout wrote, outside git's own folder. */
function checkedOut(): string[] {
  const found = spawnSync(
    'find',
    [sandboxTmp, '-name', '.git', '-prune', '-o', '-type', 'f', '-print'],
    {
      encoding: 'utf8',
    },
  )
  return found.stdout.split('\n').filter((path) => path !== '')
}

const fetchPlugin = (path: string, commitSha: string) =>
  createPluginFetcher()({ repoUrl: REPO, path, commitSha }).catch((error: unknown) => error)

beforeEach(async () => {
  vi.stubEnv('E2B_API_KEY', 'test-key')
  root = await mkdtemp(join(tmpdir(), 'plugin-checkout-'))
  sandboxTmp = join(root, 'sandbox-tmp')
  await mkdir(sandboxTmp)
  fake.create.mockImplementation(async () => localSandbox())
})
afterEach(async () => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
  await rm(root, { recursive: true, force: true })
})

const manyFiles = (folder: string, count: number) =>
  Object.fromEntries(Array.from({ length: count }, (_, i) => [`${folder}/f${i}`, `${i}\n`]))

describe('createPluginFetcher', () => {
  it('fetches only the plugin folder, from a sandbox that reaches github.com alone, however large the repository', async () => {
    const sha = await commit({
      'mods/meter/.claude-plugin/plugin.json': '{"name":"meter"}',
      'mods/meter/hooks/run.sh': 'echo hi\n',
      ...manyFiles('mods/meter2', TARBALL_MAX_FILES + 1),
    })

    const tarball = await fetchPlugin('mods/meter', sha)

    expect(await members(tarball as Uint8Array)).toEqual(
      expect.arrayContaining([
        'repo/mods/meter/.claude-plugin/plugin.json',
        'repo/mods/meter/hooks/run.sh',
      ]),
    )
    expect(await members(tarball as Uint8Array)).toHaveLength(2)
    const [template, options] = fake.create.mock.calls[0] ?? []
    expect(template).toBe(E2B_MOD_TEMPLATE_ID)
    expect(options.network.allowOut).toEqual(['github.com'])
  }, 30_000)

  it('fetches the whole repository without its git folder when the plugin is at the root', async () => {
    const sha = await commit({ '.claude-plugin/plugin.json': '{"name":"meter"}', 'run.sh': 'x\n' })

    const tarball = await fetchPlugin('', sha)

    expect((await members(tarball as Uint8Array)).sort()).toEqual([
      'repo/.claude-plugin/plugin.json',
      'repo/run.sh',
    ])
  })

  it('refuses a plugin folder over the file cap before checking any of it out', async () => {
    const sha = await commit(manyFiles('mods/meter', TARBALL_MAX_FILES + 1))

    const result = await fetchPlugin('mods/meter', sha)

    expect(result).toBeInstanceOf(Error)
    expect((result as Error).message).toMatch(`has more than ${TARBALL_MAX_FILES} files`)
    expect(checkedOut()).toEqual([])
  }, 30_000)

  it('refuses a submodule inside the plugin folder', async () => {
    const sha = await commit(
      { 'mods/meter/.claude-plugin/plugin.json': '{}' },
      { gitlinks: ['mods/meter/vendor'] },
    )

    const result = await fetchPlugin('mods/meter', sha)

    expect(result).toBeInstanceOf(PluginRefusal)
    expect((result as Error).message).toMatch(/submodules/)
  })

  it.each([
    ['a parent folder', 'mods/.gitattributes', true],
    ['a sibling folder', 'mods/other/.gitattributes', false],
  ])('a .gitattributes using LFS in %s refuses the plugin: %s', async (_name, at, refused) => {
    const sha = await commit({
      'mods/meter/.claude-plugin/plugin.json': '{}',
      [at]: '* filter=lfs diff=lfs merge=lfs -text\n',
    })

    const result = await fetchPlugin('mods/meter', sha)

    expect(result).toBeInstanceOf(refused ? PluginRefusal : Uint8Array)
    if (refused) expect((result as Error).message).toMatch(`${at} sets more than line endings`)
  })

  it('refuses a hash that names a tag rather than the commit it was pinned as', async () => {
    const sha = await commit({ '.claude-plugin/plugin.json': '{}' }, { tag: true })

    const result = await fetchPlugin('', sha)

    expect(result).toBeInstanceOf(Error)
    expect((result as Error).message).toMatch(sha)
  })

  it('refuses a plugin folder whose tarball is over the byte cap without reading it', async () => {
    const sha = await commit({
      'mods/meter/.claude-plugin/plugin.json': '{}',
      'mods/meter/noise.bin': randomBytes(TARBALL_MAX_BYTES + 1024),
    })

    const result = await fetchPlugin('mods/meter', sha)

    expect(result).toBeInstanceOf(Error)
    expect((result as Error).message).toMatch(`is larger than ${TARBALL_MAX_BYTES} bytes`)
    expect(read).not.toHaveBeenCalled()
  }, 30_000)

  it('fetches a plugin folder at a commit once for every caller', async () => {
    const sha = await commit({
      'a/.claude-plugin/plugin.json': '{}',
      'b/.claude-plugin/plugin.json': '{}',
    })
    const fetch = createPluginFetcher()

    await Promise.all([
      fetch({ repoUrl: REPO, path: 'a', commitSha: sha }),
      fetch({ repoUrl: REPO, path: 'a', commitSha: sha }),
    ])
    await fetch({ repoUrl: REPO, path: 'b', commitSha: sha })

    expect(fake.create).toHaveBeenCalledTimes(2)
  })
})
