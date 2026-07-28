import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { retainBuildAssets } from '../../scripts/retain-build-assets'

const MANIFEST = '.asset-generations.json'
const fixtureRoots = new Set<string>()

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'retain-assets-'))
  fixtureRoots.add(root)
  const currentAssetsDir = join(root, 'current')
  const previousAssetsDir = join(root, 'previous')
  await mkdir(currentAssetsDir)
  await mkdir(previousAssetsDir)
  return { currentAssetsDir, previousAssetsDir }
}

afterEach(async () => {
  await Promise.all([...fixtureRoots].map((root) => rm(root, { recursive: true, force: true })))
  fixtureRoots.clear()
})

async function put(root: string, path: string, contents = path) {
  const target = join(root, path)
  await mkdir(join(target, '..'), { recursive: true })
  await writeFile(target, contents)
}

async function manifest(root: string, generations: string[][]) {
  await writeFile(join(root, MANIFEST), JSON.stringify({ version: 1, generations }))
}

describe('retainBuildAssets', () => {
  test('accepts an empty legacy bootstrap directory', async () => {
    const dirs = await fixture()
    await put(dirs.currentAssetsDir, 'current.js')

    await retainBuildAssets(dirs)

    expect(JSON.parse(await readFile(join(dirs.currentAssetsDir, MANIFEST), 'utf8'))).toEqual({
      version: 1,
      generations: [['current.js']],
    })
  })

  test('treats legacy files without a manifest as one prior generation', async () => {
    const dirs = await fixture()
    await put(dirs.currentAssetsDir, 'current.js')
    await put(dirs.previousAssetsDir, 'legacy.js')

    await retainBuildAssets(dirs)

    expect(await readFile(join(dirs.currentAssetsDir, 'legacy.js'), 'utf8')).toBe('legacy.js')
    expect(
      JSON.parse(await readFile(join(dirs.currentAssetsDir, MANIFEST), 'utf8')).generations,
    ).toEqual([['current.js'], ['legacy.js']])
  })

  test('keeps the current plus nineteen prior distinct generations', async () => {
    const dirs = await fixture()
    await put(dirs.currentAssetsDir, 'current.js')
    const generations = Array.from({ length: 21 }, (_, index) => [`old-${index}.js`])
    for (const generation of generations) await put(dirs.previousAssetsDir, generation[0]!)
    await manifest(dirs.previousAssetsDir, generations)

    await retainBuildAssets(dirs)

    const stored = JSON.parse(await readFile(join(dirs.currentAssetsDir, MANIFEST), 'utf8'))
    expect(stored.generations).toHaveLength(20)
    expect(stored.generations.at(-1)).toEqual(['old-18.js'])
    await expect(readFile(join(dirs.currentAssetsDir, 'old-19.js'))).rejects.toMatchObject({
      code: 'ENOENT',
    })
  })

  test('deduplicates repeated generations and identical files', async () => {
    const dirs = await fixture()
    await put(dirs.currentAssetsDir, 'same.js', 'same')
    await put(dirs.previousAssetsDir, 'same.js', 'same')
    await manifest(dirs.previousAssetsDir, [['same.js'], ['same.js']])

    await retainBuildAssets(dirs)

    const stored = JSON.parse(await readFile(join(dirs.currentAssetsDir, MANIFEST), 'utf8'))
    expect(stored.generations).toEqual([['same.js']])
    expect(await readFile(join(dirs.currentAssetsDir, 'same.js'), 'utf8')).toBe('same')
  })

  test('rejects a filename collision with different contents', async () => {
    const dirs = await fixture()
    await put(dirs.currentAssetsDir, 'collision.js', 'current')
    await put(dirs.previousAssetsDir, 'collision.js', 'previous')
    await manifest(dirs.previousAssetsDir, [['collision.js']])

    await expect(retainBuildAssets(dirs)).rejects.toThrow('collision.js')
  })

  test('rejects malformed manifests', async () => {
    const dirs = await fixture()
    await put(dirs.currentAssetsDir, 'current.js')
    await writeFile(join(dirs.previousAssetsDir, MANIFEST), '{"version":1,"generations":"bad"}')

    await expect(retainBuildAssets(dirs)).rejects.toThrow('manifest')
  })

  test('rejects manifest entries whose files are missing', async () => {
    const dirs = await fixture()
    await put(dirs.currentAssetsDir, 'current.js')
    await manifest(dirs.previousAssetsDir, [['missing.js']])

    await expect(retainBuildAssets(dirs)).rejects.toThrow('missing.js')
  })

  test.each([
    '../escape.js',
    '/absolute.js',
    'nested\\\\escape.js',
    '',
  ])('rejects unsafe manifest path %j', async (unsafePath: string) => {
    const dirs = await fixture()
    await put(dirs.currentAssetsDir, 'current.js')
    await manifest(dirs.previousAssetsDir, [[unsafePath]])

    await expect(retainBuildAssets(dirs)).rejects.toThrow('unsafe')
  })

  test('rejects symlinked prior files', async () => {
    const dirs = await fixture()
    await put(dirs.currentAssetsDir, 'current.js')
    await put(join(dirs.previousAssetsDir, '..'), 'outside.js')
    await symlink(
      join(dirs.previousAssetsDir, '..', 'outside.js'),
      join(dirs.previousAssetsDir, 'link.js'),
    )
    await manifest(dirs.previousAssetsDir, [['link.js']])

    await expect(retainBuildAssets(dirs)).rejects.toThrow('link.js')
  })

  test('rejects files beneath a symlinked prior directory', async () => {
    const dirs = await fixture()
    await put(dirs.currentAssetsDir, 'current.js')
    const outsideDir = join(dirs.previousAssetsDir, '..', 'outside')
    await put(outsideDir, 'secret.js', 'secret')
    await symlink(outsideDir, join(dirs.previousAssetsDir, 'nested'))
    await manifest(dirs.previousAssetsDir, [['nested/secret.js']])

    await expect(retainBuildAssets(dirs)).rejects.toThrow('nested/secret.js')
  })
})
