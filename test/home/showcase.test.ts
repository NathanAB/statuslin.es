import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { getHeroLines } from '@/gallery/hero-lines'
import { getHomeShowcase } from '@/home/showcase'
import { FEATURED_MOD_SLUG } from '@/mods/featured-mod'
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
  it("carries the hero's status lines", async () => {
    const showcase = await getHomeShowcase(db)
    expect(showcase.hero).toEqual(await getHeroLines(db))
    expect(showcase.hero[0]?.slug).toBe('top-line')
  })

  it('puts the featured mod apart from the rest, which leave it out', async () => {
    const { mods } = await getHomeShowcase(db)

    expect(mods.featured?.slug).toBe(FEATURED_MOD_SLUG)
    expect(mods.others.map((mod) => mod.slug)).toEqual(['other-mod'])
  })
})
