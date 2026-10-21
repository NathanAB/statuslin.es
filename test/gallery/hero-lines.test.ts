import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { getConfigSource } from '@/gallery/config-items'
import { getHeroLines, HERO_SESSION_KEYS, HERO_SIZE } from '@/gallery/hero-lines'
import { openTestDb, type TestDb } from '../mods/seed-mods'
import {
  addConfigDesktopPreview,
  addPublishedConfig,
  CONFIG_DESKTOP_SHOT,
  currentVersionOf,
} from './seed-configs'

let db: TestDb
let close: () => Promise<void>

const shaOf = (slug: string) => slug.padEnd(64, '0')

async function addPreview(slug: string, scenarioKey: string, text: string) {
  await db.insert(schema.previews).values({
    scriptSha: shaOf(slug),
    scenarioKey,
    segments: [{ text, fg: null, bg: null, bold: false, italic: false, underline: false }],
    rawStdout: text,
    exitCode: 0,
    timedOut: 0,
    trace: { networkAttempts: [], sensitiveReads: [], spawnedProcesses: [] },
  })
}

async function addCopies(configId: string, count: number) {
  for (let i = 0; i < count; i++) {
    await db.insert(schema.copyEvents).values({ configId, ipHash: `${configId}-${i}` })
  }
}

beforeAll(async () => {
  ;({ db, close } = await openTestDb())
  // Ten published lines, copied different amounts, so Trending has an order of its own.
  for (let i = 0; i < 10; i++) {
    const id = await addPublishedConfig(db, `line-${i}`)
    await addCopies(id, (i * 7) % 10)
    if (i === 7) await addConfigDesktopPreview(db, await currentVersionOf(db, id))
  }
  await addPublishedConfig(db, 'drafted', { status: 'draft' })
  await addPreview('line-7', 'clean-main', 'clean')
  await addPreview('line-7', 'fresh-session', 'fresh')
  await addPreview('line-7', 'dirty-feature', 'dirty')
  await addPreview('line-7', 'big-context', 'big')
  await addPreview('line-7', 'near-full', 'not a hero session')
})
afterAll(async () => {
  await close()
})

describe('getHeroLines', () => {
  it('takes the first eight status lines in the order the home gallery ranks them', async () => {
    const gallery = await getConfigSource(db, { sort: 'trending' })
    const expected = gallery.items.slice(0, HERO_SIZE).map(({ item }) => item.card.slug)

    const lines = await getHeroLines(db)

    expect(HERO_SIZE).toBe(8)
    expect(lines.map((line) => line.slug)).toEqual(expected)
    expect(lines.map((line) => line.slug)).not.toContain('drafted')
  })

  it("loads each line's render for every hero session, and only those", async () => {
    const lines = await getHeroLines(db)
    const line = lines.find((l) => l.slug === 'line-7')

    expect(HERO_SESSION_KEYS).toEqual([
      'clean-main',
      'fresh-session',
      'dirty-feature',
      'big-context',
    ])
    expect(
      Object.fromEntries(
        Object.entries(line?.renders ?? {}).map(([key, segments]) => [key, segments?.[0]?.text]),
      ),
    ).toEqual({
      'clean-main': 'clean',
      'fresh-session': 'fresh',
      'dirty-feature': 'dirty',
      'big-context': 'big',
    })
    // Segments go out compact: no default style fields.
    expect(line?.renders['clean-main']?.[0]).toEqual({ text: 'clean' })
  })

  it('carries what the hero names: title, copy count and author', async () => {
    const [first] = await getHeroLines(db)

    expect(first).toMatchObject({
      title: first?.slug,
      copyCount: expect.any(Number),
      author: { name: 'Author', username: null, image: null },
      // What it can reach, said beside the hero's install button.
      networkHosts: [],
      readsClaudeToken: false,
    })
    expect(first?.configId).toEqual(expect.any(String))
  })

  // The hero's Desktop view shows the line as statusline-anywhere draws it in Claude Desktop.
  it("carries each line's Desktop shot, and null for a line without one", async () => {
    const lines = await getHeroLines(db)

    expect(lines.find((l) => l.slug === 'line-7')?.desktop).toEqual({
      src: expect.stringMatching(/\/desktop\.png\?r=\d+$/),
      width: CONFIG_DESKTOP_SHOT.width,
      height: CONFIG_DESKTOP_SHOT.height,
    })
    expect(lines.filter((l) => l.slug !== 'line-7').map((l) => l.desktop)).toEqual(
      Array(lines.length - 1).fill(null),
    )
  })

  // So the home page can rank status lines and mods together, as its gallery does.
  it("carries each line's Trending value, largest first", async () => {
    const keys = (await getHeroLines(db)).map((line) => line.sortKey ?? 0)
    expect(keys).toEqual([...keys].sort((a, b) => b - a))
    expect(keys[0]).toBeGreaterThan(0)
  })
})
