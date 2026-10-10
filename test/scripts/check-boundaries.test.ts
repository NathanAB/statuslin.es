import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { ICruiseResult } from 'dependency-cruiser'
import { afterEach, describe, expect, test } from 'vitest'

// Runs the same depcruise CLI and config as `bun run check:boundaries`, so a parser that silently
// skips TypeScript (issue #68: TypeScript 7 has no compiler API, so 0 modules were cruised and
// every rule passed) fails here instead of passing the gate.
const REPO_ROOT = join(import.meta.dirname, '..', '..')
const DEPCRUISE = join(REPO_ROOT, 'node_modules', '.bin', 'depcruise')
const CONFIG = join(REPO_ROOT, '.dependency-cruiser.cjs')
const TIMEOUT_MS = 30_000

function depcruise(cwd: string, extraArgs: string[] = []) {
  return spawnSync(DEPCRUISE, ['src', '--config', CONFIG, ...extraArgs], {
    cwd,
    encoding: 'utf8',
    timeout: TIMEOUT_MS,
  })
}

const fixtureRoots = new Set<string>()

afterEach(async () => {
  await Promise.all([...fixtureRoots].map((root) => rm(root, { recursive: true, force: true })))
  fixtureRoots.clear()
})

async function fixture(files: Record<string, string>) {
  const root = await mkdtemp(join(tmpdir(), 'check-boundaries-'))
  fixtureRoots.add(root)
  for (const [path, contents] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true })
    await writeFile(join(root, path), contents)
  }
  return root
}

describe('check:boundaries', () => {
  test(
    'cruises every TypeScript module under src',
    async () => {
      const entries = await readdir(join(REPO_ROOT, 'src'), { recursive: true })
      const sources = entries.filter((p) => /\.tsx?$/.test(p)).map((p) => join('src', p))

      const { stdout } = depcruise(REPO_ROOT, ['--output-type', 'json'])
      const cruised = new Set((JSON.parse(stdout) as ICruiseResult).modules.map((m) => m.source))

      expect(sources.filter((source) => !cruised.has(source))).toEqual([])
    },
    TIMEOUT_MS,
  )

  test(
    'fails when a route imports the DB through the @/ alias',
    async () => {
      const root = await fixture({
        'tsconfig.json': JSON.stringify({ compilerOptions: { paths: { '@/*': ['./src/*'] } } }),
        'src/db/index.ts': 'export const db = {}\n',
        'src/routes/leak.ts': "import { db } from '@/db'\nexport const leak = db\n",
      })

      const { status, stdout } = depcruise(root)

      expect(status).not.toBe(0)
      expect(stdout).toContain('routes-no-direct-db')
    },
    TIMEOUT_MS,
  )

  test(
    'lets src/mods import only the gallery, and fails when src/gallery imports src/mods',
    async () => {
      const root = await fixture({
        'tsconfig.json': JSON.stringify({ compilerOptions: { paths: { '@/*': ['./src/*'] } } }),
        'src/gallery/listing.ts':
          "import { modCard } from '@/mods/card'\nexport const listing = modCard\n",
        'src/mods/card.ts':
          "import { rank } from '@/gallery/ranking'\nexport const modCard = rank\n",
        'src/gallery/ranking.ts': 'export const rank = 1\n',
        'src/mods/install.ts':
          "import { copied } from '@/adopt/copy'\nexport const install = copied\n",
        'src/adopt/copy.ts': 'export const copied = 1\n',
      })

      const { stdout } = depcruise(root, ['--output-type', 'json'])
      const { violations } = (JSON.parse(stdout) as ICruiseResult).summary

      expect(violations.map(({ rule, from, to }) => ({ rule: rule.name, from, to }))).toEqual([
        {
          rule: 'gallery-no-cross-feature',
          from: 'src/gallery/listing.ts',
          to: 'src/mods/card.ts',
        },
        { rule: 'mods-no-cross-feature', from: 'src/mods/install.ts', to: 'src/adopt/copy.ts' },
      ])
    },
    TIMEOUT_MS,
  )
})
