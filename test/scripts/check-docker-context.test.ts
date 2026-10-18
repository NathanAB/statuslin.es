import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { describeLeaks, findGitIgnored, listArchive } from '../../scripts/check-docker-context'

const fixtureRoots = new Set<string>()

afterEach(async () => {
  vi.unstubAllEnvs()
  await Promise.all([...fixtureRoots].map((root) => rm(root, { recursive: true, force: true })))
  fixtureRoots.clear()
})

function git(root: string, ...args: string[]) {
  const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' })
  if (result.status !== 0) throw new Error(result.stderr)
}

async function repo(gitignore: string, files: string[]) {
  const root = await mkdtemp(join(tmpdir(), 'docker-context-'))
  fixtureRoots.add(root)
  git(root, 'init', '--quiet')
  await writeFile(join(root, '.gitignore'), gitignore)
  for (const file of files) {
    await mkdir(dirname(join(root, file)), { recursive: true })
    await writeFile(join(root, file), file)
  }
  return root
}

describe('findGitIgnored', () => {
  it('returns exactly the context files git ignores, at any depth', async () => {
    const files = [
      'src/app.ts',
      '.env.example',
      '.worktrees/old-branch/.env.local',
      '.worktrees/old-branch/src/app.ts',
      'packages/web/node_modules/dep/index.js',
      'packages/web/.env.local',
    ]
    const root = await repo('.worktrees/\nnode_modules/\n.env.*\n!.env.example\n', files)

    expect(findGitIgnored(root, files).sort()).toEqual([
      '.worktrees/old-branch/.env.local',
      '.worktrees/old-branch/src/app.ts',
      'packages/web/.env.local',
      'packages/web/node_modules/dep/index.js',
    ])
  })

  it('does not report a tracked file that matches an ignore pattern', async () => {
    const root = await repo('dist/\n', ['dist/keep.txt'])
    git(root, 'add', '--force', 'dist/keep.txt')

    expect(findGitIgnored(root, ['dist/keep.txt'])).toEqual([])
  })
})

describe('listArchive', () => {
  it('lists files by their real names under a C locale', async () => {
    vi.stubEnv('LC_ALL', 'C')
    const root = await mkdtemp(join(tmpdir(), 'docker-context-'))
    fixtureRoots.add(root)
    await mkdir(join(root, 'src', 'café'), { recursive: true })
    await writeFile(join(root, 'src', 'café', 'plain.txt'), 'x')
    const archive = join(root, 'context.tar')
    const tar = spawnSync('tar', ['-cf', archive, '-C', join(root, 'src'), 'café'])
    if (tar.status !== 0) throw new Error(String(tar.stderr))

    const files = listArchive(archive)

    expect(files.map((file) => file.normalize('NFC'))).toEqual(['café/plain.txt'])
  })
})

describe('describeLeaks', () => {
  it('counts leaked files per top-level path with one example each', () => {
    const message = describeLeaks([
      '.worktrees/a/.env.local',
      '.worktrees/a/node_modules/x.js',
      '.worktrees/b/.env.local',
      '.agents/notes.md',
    ])

    expect(message).toContain('4 git-ignored files')
    expect(message).toContain('.worktrees  3 files, e.g. .worktrees/a/.env.local')
    expect(message).toContain('.agents  1 file, e.g. .agents/notes.md')
  })
})
