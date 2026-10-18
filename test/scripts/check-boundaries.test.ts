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
    'fails on each cross-boundary import and allows the permitted ones',
    async () => {
      const root = await fixture({
        'tsconfig.json': JSON.stringify({ compilerOptions: { paths: { '@/*': ['./src/*'] } } }),
        // A route must not reach the DB, even through the @/ alias.
        'src/db/index.ts': 'export const db = {}\n',
        'src/routes/leak.ts': "import { db } from '@/db'\nexport const leak = db\n",
        // src/mods may import the gallery, but src/gallery must not import src/mods.
        'src/gallery/listing.ts':
          "import { modCard } from '@/mods/card'\nexport const listing = modCard\n",
        'src/mods/card.ts':
          "import { rank } from '@/gallery/ranking'\nexport const modCard = rank\n",
        'src/gallery/ranking.ts': 'export const rank = 1\n',
        'src/mods/install.ts':
          "import { copied } from '@/adopt/copy'\nexport const install = copied\n",
        'src/adopt/copy.ts': 'export const copied = 1\n',
        // src/review may import the mod publish, query and GitHub code, and nothing else in src/mods.
        'src/review/kinds/mod.ts': [
          "import { guards } from '@/mods/publish'",
          "import { rows } from '@/mods/queries'",
          "import { github } from '@/mods/github'",
          "import { submit } from '@/mods/submit'",
          'export const all = [guards, rows, github, submit]',
          '',
        ].join('\n'),
        'src/mods/publish.ts': 'export const guards = 1\n',
        'src/mods/queries.ts': 'export const rows = 1\n',
        'src/mods/github.ts': 'export const github = 1\n',
        'src/mods/submit.ts': 'export const submit = 1\n',
      })

      const { stdout } = depcruise(root, ['--output-type', 'json'])
      const { violations } = (JSON.parse(stdout) as ICruiseResult).summary

      // The JSON reporter exits 0; an error-severity violation is what fails the real gate.
      expect(violations.every(({ rule }) => rule.severity === 'error')).toBe(true)
      expect(violations.map(({ rule, from, to }) => ({ rule: rule.name, from, to }))).toEqual(
        expect.arrayContaining([
          { rule: 'routes-no-direct-db', from: 'src/routes/leak.ts', to: 'src/db/index.ts' },
          {
            rule: 'gallery-no-cross-feature',
            from: 'src/gallery/listing.ts',
            to: 'src/mods/card.ts',
          },
          { rule: 'mods-no-cross-feature', from: 'src/mods/install.ts', to: 'src/adopt/copy.ts' },
          {
            rule: 'review-no-cross-feature',
            from: 'src/review/kinds/mod.ts',
            to: 'src/mods/submit.ts',
          },
        ]),
      )
      expect(violations).toHaveLength(4)
    },
    TIMEOUT_MS,
  )
})
