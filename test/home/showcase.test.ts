import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { getHeroLines, type HeroLine } from '@/gallery/hero-lines'
import { getHomeShowcase, heroItems } from '@/home/showcase'
import { FEATURED_MOD_SLUG } from '@/mods/featured-mod'
import { getHeroMods, type HeroMod } from '@/mods/gallery-queries'
import { addPublishedConfig } from '../gallery/seed-configs'
import {
  addDesktopPreview,
  addMod,
  addVersion,
  openTestDb,
  setCurrentVersion,
  sha,
  type TestDb,
} from '../mods/seed-mods'

let db: TestDb
let close: () => Promise<void>
const SOURCE = '#!/usr/bin/env bash\necho one\necho two\necho three\necho four'

async function addPublishedMod(slug: string, commitChar: string) {
  const modId = await addMod(db, slug, 'published')
  const versionId = await addVersion(db, modId, { commitSha: sha(commitChar), versionNumber: 1 })
  await addDesktopPreview(db, versionId, 'shot')
  await setCurrentVersion(db, modId, versionId)
}

beforeAll(async () => {
  ;({ db, close } = await openTestDb())
  const top = await addPublishedConfig(db, 'top-line', { source: SOURCE })
  await db.insert(schema.copyEvents).values({ configId: top, ipHash: 'one' })
  await addPublishedConfig(db, 'second-line')
  await db.insert(schema.previews).values({
    scriptSha: 'top-line'.padEnd(64, '0'),
    scenarioKey: 'clean-main',
    segments: [
      { text: 'top clean', fg: null, bg: null, bold: false, italic: false, underline: false },
    ],
    rawStdout: 'top clean',
    exitCode: 0,
    timedOut: 0,
    trace: { networkAttempts: [], sensitiveReads: [], spawnedProcesses: [] },
  })
  await addPublishedMod(FEATURED_MOD_SLUG, 'a')
  await addPublishedMod('other-mod', 'b')
})
afterAll(async () => {
  await close()
})

// The parts of the home page that don't change with the gallery's sort, kind, tags or page.
describe('getHomeShowcase', () => {
  it("carries the hero's status lines and mods, ranked together", async () => {
    // Trending decays with the clock, so compare what is listed, not the values.
    const listed = (items: ReturnType<typeof heroItems>) =>
      items.map((item) => `${item.kind}:${item.kind === 'mod' ? item.mod.slug : item.line.slug}`)
    const showcase = await getHomeShowcase(db)
    expect(listed(showcase.hero)).toEqual(
      listed(heroItems(await getHeroLines(db), await getHeroMods(db))),
    )
    expect(showcase.hero.map((item) => item.kind)).toContain('mod')
    expect(showcase.hero[0]).toMatchObject({ kind: 'status-line', line: { slug: 'top-line' } })
  })

  it('puts the featured mod apart from the rest, which leave it out', async () => {
    const { mods } = await getHomeShowcase(db)

    expect(mods.featured?.slug).toBe(FEATURED_MOD_SLUG)
    expect(mods.others.map((mod) => mod.slug)).toEqual(['other-mod'])
  })
})

// The hero lists what the home gallery would: status lines and mods on one Trending scale.
describe('heroItems', () => {
  const line = (slug: string, sortKey: number | null) => ({ slug, sortKey }) as HeroLine
  const mod = (slug: string, sortKey: number | null) => ({ slug, sortKey }) as HeroMod
  const slugs = (items: ReturnType<typeof heroItems>) =>
    items.map((item) => `${item.kind}:${item.kind === 'mod' ? item.mod.slug : item.line.slug}`)

  it('merges both kinds by Trending, largest first, with ties keeping status lines first', () => {
    expect(
      slugs(heroItems([line('a', 9), line('b', 2), line('c', null)], [mod('m', 5), mod('n', 2)])),
    ).toEqual(['status-line:a', 'mod:m', 'status-line:b', 'mod:n', 'status-line:c'])
  })

  it('keeps eight, at least three of each kind when there are that many', () => {
    const lines = Array.from({ length: 8 }, (_, i) => line(`l${i}`, 10 - i))
    const mods = Array.from({ length: 8 }, (_, i) => mod(`m${i}`, 1 - i / 10))
    const items = heroItems(lines, mods)

    expect(items).toHaveLength(8)
    // Mods trend lower here, yet three still make the list, in Trending order after the lines.
    expect(slugs(items)).toEqual([
      'status-line:l0',
      'status-line:l1',
      'status-line:l2',
      'status-line:l3',
      'status-line:l4',
      'mod:m0',
      'mod:m1',
      'mod:m2',
    ])
    expect(
      slugs(heroItems(lines.slice(0, 2), mods)).filter((s) => s.startsWith('mod')),
    ).toHaveLength(6)
  })
})
