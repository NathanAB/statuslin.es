import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { type ModCardBody, modCard } from '@/og/card'
import { toElementPng } from '@/og/render'
import { modCardResponse } from '@/og/routes'
import {
  addDesktopPreview,
  openTestDb,
  SEEDED_DESKTOP_SHOT,
  SEEDED_PREVIEW,
  seedMod,
  type TestDb,
} from '../mods/seed-mods'

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

let db: TestDb
let close: () => Promise<void>

beforeAll(async () => {
  ;({ db, close } = await openTestDb())
  await seedMod(db, 'meter', 'published', 'a')
  const both = await seedMod(db, 'both', 'published', 'e')
  await addDesktopPreview(db, both.versionId)
  const anywhere = await seedMod(db, 'anywhere', 'published', 'b')
  await drawsNothingInTheTerminal(anywhere.versionId)
  await addDesktopPreview(db, anywhere.versionId)
  const blank = await seedMod(db, 'blank', 'published', 'f')
  await drawsNothingInTheTerminal(blank.versionId)
  await seedMod(db, 'draft-mod', 'draft', 'c')
  await seedMod(db, 'removed-mod', 'removed', 'd')
})
afterAll(async () => {
  await close()
})

async function drawsNothingInTheTerminal(versionId: string) {
  await db
    .update(schema.modPreviews)
    .set({ segments: [] })
    .where(eq(schema.modPreviews.modVersionId, versionId))
}

const SEEDED_SHOT_BODY: ModCardBody = {
  kind: 'desktop',
  shot: {
    src: `data:image/png;base64,${Buffer.from(SEEDED_DESKTOP_SHOT.png).toString('base64')}`,
    width: SEEDED_DESKTOP_SHOT.width,
    height: SEEDED_DESKTOP_SHOT.height,
  },
}

async function magic(res: Response) {
  return Array.from(new Uint8Array(await res.arrayBuffer()).slice(0, 8))
}

describe('modCardResponse', () => {
  it.each([
    ['a published mod with a terminal preview', 'meter'],
    ['a published mod that draws only in Claude Desktop', 'anywhere'],
  ])('renders a PNG for %s', async (_name, slug) => {
    const res = await modCardResponse(db, slug)

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
    expect(res.headers.get('cache-control')).toBe('public, max-age=3600')
    expect(await magic(res)).toEqual(PNG_MAGIC)
  })

  it.each<[string, string, ModCardBody]>([
    ['its terminal preview', 'meter', { kind: 'terminal', segments: SEEDED_PREVIEW.segments }],
    [
      'its terminal preview over its Desktop shot',
      'both',
      { kind: 'terminal', segments: SEEDED_PREVIEW.segments },
    ],
    [
      'its Desktop shot, at its size, when it draws nothing in the terminal',
      'anywhere',
      SEEDED_SHOT_BODY,
    ],
    ['the chip when it draws nothing in either', 'blank', { kind: 'none' }],
  ])('draws %s', async (_name, slug, body) => {
    const res = await modCardResponse(db, slug)
    const expected = await toElementPng(modCard({ title: slug, authorGithub: 'octocat', body }))

    expect(Buffer.from(await res.arrayBuffer()).equals(Buffer.from(expected))).toBe(true)
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
