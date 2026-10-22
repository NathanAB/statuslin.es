import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { getHowItWorksExamples } from '@/how-it-works/examples'
import { buildMarketplace } from '@/mods/marketplace'
import { getMarketplaceRows } from '@/mods/queries'
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

const ORIGIN = 'https://statuslin.es'
const segment = (text: string) => ({
  text,
  fg: null,
  bg: null,
  bold: false,
  italic: false,
  underline: false,
})

let db: TestDb
let close: () => Promise<void>

async function addPublishedMod(slug: string, commitChar: string) {
  const modId = await addMod(db, slug, 'published')
  const versionId = await addVersion(db, modId, { commitSha: sha(commitChar), versionNumber: 1 })
  await addDesktopPreview(db, versionId, 'shot')
  await setCurrentVersion(db, modId, versionId)
}

async function addPreview(slug: string, scenarioKey: string, text: string) {
  await db.insert(schema.previews).values({
    scriptSha: slug.padEnd(64, '0'),
    scenarioKey,
    segments: [segment(text)],
    rawStdout: text,
    exitCode: 0,
    timedOut: 0,
    trace: { networkAttempts: [], sensitiveReads: [], spawnedProcesses: [] },
  })
}

beforeAll(async () => {
  ;({ db, close } = await openTestDb())
  const top = await addPublishedConfig(db, 'top-line')
  await db.insert(schema.copyEvents).values({ configId: top, ipHash: 'one' })
  await addPreview('top-line', 'fresh-session', 'top new')
  await addPreview('top-line', 'clean-main', 'top clean')
  await addPublishedMod('first-mod', 'a')
})
afterAll(async () => {
  await close()
})

// The page's examples are the listings the home hero leads with, shown as their own pages show them.
describe('getHowItWorksExamples', () => {
  it('takes the top status line with its previews in session order', async () => {
    const { line } = await getHowItWorksExamples(db, ORIGIN)

    expect(line?.title).toBe('top-line')
    expect(line?.previews.map((p) => p.scenarioKey)).toEqual(['clean-main', 'fresh-session'])
  })

  // The whole entry runs wide with its description and keywords; its name and source hold the pin.
  it("takes the top mod with its entry's name and source as /marketplace.json serves them", async () => {
    const { mod } = await getHowItWorksExamples(db, ORIGIN)
    const served = buildMarketplace(ORIGIN, await getMarketplaceRows(db)).plugins.find(
      (plugin) => plugin.name === 'first-mod',
    )

    expect(mod?.detail.slug).toBe('first-mod')
    expect(JSON.parse(mod?.entry ?? 'null')).toEqual({ name: served?.name, source: served?.source })
    expect(mod?.entryHtml).toContain('class="shiki')
    expect(mod?.entryHtml).toContain(sha('a'))
  })
})

describe('getHowItWorksExamples on an empty gallery', () => {
  it('has no examples to show', async () => {
    const empty = await openTestDb()
    try {
      expect(await getHowItWorksExamples(empty.db, ORIGIN)).toEqual({ line: null, mod: null })
    } finally {
      await empty.close()
    }
  })
})
