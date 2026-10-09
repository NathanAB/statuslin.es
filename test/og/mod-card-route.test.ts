import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { modCardResponse } from '@/og/routes'
import { openTestDb, seedMod, type TestDb } from '../mods/seed-mods'

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

let db: TestDb
let close: () => Promise<void>

beforeAll(async () => {
  ;({ db, close } = await openTestDb())
  await seedMod(db, 'meter', 'published', 'a')
  const anywhere = await seedMod(db, 'anywhere', 'published', 'b', false)
  await db
    .update(schema.modVersions)
    .set({ desktopScreenshot: '/mods/screenshots/anywhere.png' })
    .where(eq(schema.modVersions.id, anywhere.versionId))
  await seedMod(db, 'draft-mod', 'draft', 'c')
  await seedMod(db, 'removed-mod', 'removed', 'd')
})
afterAll(async () => {
  await close()
})

async function magic(res: Response) {
  return Array.from(new Uint8Array(await res.arrayBuffer()).slice(0, 8))
}

describe('modCardResponse', () => {
  it.each([
    ['a published mod with a terminal preview', 'meter'],
    ['a screenshot-only published mod', 'anywhere'],
  ])('renders a PNG for %s', async (_name, slug) => {
    const res = await modCardResponse(db, slug)

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
    expect(res.headers.get('cache-control')).toBe('public, max-age=3600')
    expect(await magic(res)).toEqual(PNG_MAGIC)
  })

  it.each([
    ['a draft mod', 'draft-mod'],
    ['a removed mod', 'removed-mod'],
    ['an unknown slug', 'nope'],
  ])('is a 404 for %s', async (_name, slug) => {
    const res = await modCardResponse(db, slug)

    expect(res.status).toBe(404)
    expect(res.headers.get('content-type')).not.toBe('image/png')
  })
})
