import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { type ModCardBody, modCard } from '@/og/card'
import { toElementPng } from '@/og/render'
import { modCardResponse } from '@/og/routes'
import type { AnsiSegment } from '@/render/types'
import { HOOK_ERROR_ONLY_PREVIEW } from '../mods/fixtures/hook-error-previews'
import {
  addDesktopPreview,
  addMod,
  addTheme,
  addVersion,
  openTestDb,
  SEEDED_DESKTOP_SHOT,
  SEEDED_PREVIEW,
  seedMod,
  setCurrentVersion,
  sha,
  type TestDb,
} from '../mods/seed-mods'

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
  // A Desktop theme mod: its terminal recording is only Claude Code's error for its hook.
  const crashed = await seedMod(db, 'crashed', 'published', '3')
  await db
    .update(schema.modPreviews)
    .set({ segments: HOOK_ERROR_ONLY_PREVIEW })
    .where(eq(schema.modPreviews.modVersionId, crashed.versionId))
  await addDesktopPreview(db, crashed.versionId)
  await seedMod(db, 'draft-mod', 'draft', 'c')
  await seedMod(db, 'removed-mod', 'removed', 'd')
  // Themes alone: Night is added first, Dawn comes first by name.
  const pack = await seedMod(db, 'pack', 'published', '1')
  await addTheme(db, pack.versionId, { key: 'night', name: 'Night' })
  const dawn = await addTheme(db, pack.versionId, { key: 'dawn', name: 'Dawn', window: 'light' })
  await db
    .update(schema.modThemePreviews)
    .set({ segments: DAWN_SCREEN })
    .where(eq(schema.modThemePreviews.themeId, dawn))
  // Themes and a hooks module: a mod, whose card draws its own terminal preview.
  const mixedId = await addMod(db, 'mixed', 'published')
  const mixed = await addVersion(db, mixedId, {
    commitSha: sha('2'),
    versionNumber: 1,
    hooksModules: ['./register.ts'],
  })
  await setCurrentVersion(db, mixedId, mixed)
  await addTheme(db, mixed, { key: 'dawn', name: 'Dawn', window: 'light' })
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

const DAWN_SCREEN: AnsiSegment[] = [
  { text: '❯ hello', fg: 'rgb(119, 136, 153)', bg: 'rgb(238, 232, 213)' },
]

const SEEDED_SHOT_BODY: ModCardBody = {
  kind: 'desktop',
  shot: {
    src: `data:image/png;base64,${Buffer.from(SEEDED_DESKTOP_SHOT.png).toString('base64')}`,
    width: SEEDED_DESKTOP_SHOT.width,
    height: SEEDED_DESKTOP_SHOT.height,
  },
}

describe('modCardResponse', () => {
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
    [
      "its Desktop shot when its only terminal output is its hook's error",
      'crashed',
      SEEDED_SHOT_BODY,
    ],
    [
      "a theme plugin's first theme by name, in its window, in place of its own recording",
      'pack',
      { kind: 'themes', count: 2, first: { segments: DAWN_SCREEN, window: 'light' } },
    ],
    [
      'its own terminal preview for a mod that also carries themes',
      'mixed',
      { kind: 'terminal', segments: SEEDED_PREVIEW.segments },
    ],
  ])('draws %s', async (_name, slug, body) => {
    const res = await modCardResponse(db, slug)
    const expected = await toElementPng(modCard({ title: slug, authorGithub: 'octocat', body }))

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
    expect(res.headers.get('cache-control')).toBe('public, max-age=3600')
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
