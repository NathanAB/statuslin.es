import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { configDesktopPreviewResponse } from '@/gallery/desktop-preview-image'
import { openTestDb, type TestDb } from '../mods/seed-mods'
import {
  addConfigDesktopPreview,
  addPublishedConfig,
  CONFIG_DESKTOP_SHOT,
  currentVersionOf,
} from './seed-configs'

let db: TestDb
let close: () => Promise<void>
const ids: Record<string, string> = {}

beforeAll(async () => {
  ;({ db, close } = await openTestDb())
  const liveConfig = await addPublishedConfig(db, 'live')
  ids.live = await currentVersionOf(db, liveConfig)
  await addConfigDesktopPreview(db, ids.live)
  const [older] = await db
    .insert(schema.configVersions)
    .values({
      configId: liveConfig,
      versionNumber: 0,
      title: 'older',
      source: 'echo old',
      interpreter: 'bash',
      contentSha256: 'o'.repeat(64),
      status: 'approved',
    })
    .returning({ id: schema.configVersions.id })
  ids.older = older?.id as string
  await addConfigDesktopPreview(db, ids.older)
  for (const status of ['draft', 'removed']) {
    ids[status] = await currentVersionOf(db, await addPublishedConfig(db, status, { status }))
    await addConfigDesktopPreview(db, ids[status] as string)
  }
  ids.nothing = await currentVersionOf(db, await addPublishedConfig(db, 'blank'))
  await addConfigDesktopPreview(db, ids.nothing, 'nothing')
  ids.unrendered = await currentVersionOf(db, await addPublishedConfig(db, 'unrendered'))
  // Another config whose current_version_id names the live config's version: no FK stops it.
  const borrowed = await addPublishedConfig(db, 'borrowed')
  await db
    .update(schema.configs)
    .set({ currentVersionId: ids.older })
    .where(eq(schema.configs.id, borrowed))
})
afterAll(async () => {
  await close()
})

/** The `r` the page puts in a version's image URL: when its Desktop result was stored. */
async function renderOf(versionId: string): Promise<string> {
  const [row] = await db
    .select({ createdAt: schema.configDesktopPreviews.createdAt })
    .from(schema.configDesktopPreviews)
    .where(eq(schema.configDesktopPreviews.configVersionId, versionId))
  return String(row?.createdAt.getTime() ?? 0)
}

describe('configDesktopPreviewResponse', () => {
  it("serves a published status line's current Desktop shot as a PNG cached for an hour", async () => {
    const live = ids.live as string
    const res = await configDesktopPreviewResponse(db, live, await renderOf(live))

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    // Short enough that a removed status line's image leaves shared caches soon after its page does.
    expect(res.headers.get('cache-control')).toBe('public, max-age=3600')
    expect(Array.from(new Uint8Array(await res.arrayBuffer()))).toEqual(
      Array.from(CONFIG_DESKTOP_SHOT.png),
    )
  })

  it.each([
    ['a draft status line', 'draft'],
    ['a removed status line', 'removed'],
    ['a version that is no longer current, even one another config names', 'older'],
    ['a version that drew nothing in Desktop', 'nothing'],
    ['a version with no Desktop result', 'unrendered'],
  ])('is a 404 for %s', async (_name, key) => {
    const versionId = ids[key] as string
    const res = await configDesktopPreviewResponse(db, versionId, await renderOf(versionId))

    expect(res.status).toBe(404)
    expect(res.headers.get('content-type')).not.toBe('image/png')
  })

  it.each([
    ['an unknown id', '00000000-0000-4000-8000-000000000000'],
    ['an id that is not a UUID', 'not-a-uuid'],
  ])('is a 404 for %s', async (_name, versionId) => {
    expect((await configDesktopPreviewResponse(db, versionId, '0')).status).toBe(404)
  })

  it.each([
    ['no render', null],
    ['another render', '1'],
    ['a render that is not a number', 'abc'],
  ])(
    'is a 404 for the current shot named with %s, so made-up URLs miss every cache',
    async (_name, render) => {
      expect((await configDesktopPreviewResponse(db, ids.live as string, render)).status).toBe(404)
    },
  )
})
