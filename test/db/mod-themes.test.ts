import type { PGlite } from '@electric-sql/pglite'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import {
  addDesktopTheme,
  addMod,
  addVersion,
  openTestDb,
  SEEDED_THEME_SHOT,
  type TestDb,
} from '../mods/seed-mods'

let client: PGlite
let db: TestDb
let versionId: string

beforeAll(async () => {
  ;({ client, db } = await openTestDb())
  versionId = await addVersion(db, await addMod(db, 'theme-examples', 'draft'), {
    commitSha: 'a'.repeat(40),
    versionNumber: 1,
  })
})
afterAll(async () => {
  await client.close()
})

const violates = (constraint: string) => ({ cause: { constraint } })
const DESKTOP = { kind: 'desktop' as const, window: 'dark' as const }
const TERMINAL = { kind: 'terminal' as const, window: 'dark' as const, source: '{}' }

describe('mod_themes', () => {
  it('keeps a Desktop theme with its switch steps and no file', async () => {
    const id = await addDesktopTheme(db, versionId, {
      key: 'night-reef',
      name: 'Night Reef',
      switchSteps: ['/custom-theme night-reef'],
    })

    const [stored] = await db.select().from(schema.modThemes).where(eq(schema.modThemes.id, id))
    expect(stored).toMatchObject({
      kind: 'desktop',
      source: null,
      switchSteps: ['/custom-theme night-reef'],
    })
  })

  it('keeps a Desktop theme its mod sets on its own, with no steps', async () => {
    await expect(
      addDesktopTheme(db, versionId, { key: 'rainy-window', switchSteps: [], rendered: false }),
    ).resolves.toEqual(expect.any(String))
  })

  it.each([
    ['a terminal theme with no file', { ...TERMINAL, key: 't1', name: 't1', source: null }],
    [
      'a terminal theme with switch steps',
      { ...TERMINAL, key: 't2', name: 't2', switchSteps: ['/theme'] },
    ],
    ['a Desktop theme with no switch steps', { ...DESKTOP, key: 'd1', name: 'd1' }],
    [
      'a Desktop theme with a file',
      { ...DESKTOP, key: 'd2', name: 'd2', source: '{}', switchSteps: [] },
    ],
    [
      'Desktop switch steps that are not a list',
      { ...DESKTOP, key: 'd3', name: 'd3', switchSteps: 'x' },
    ],
  ])('refuses %s', async (_name, row) => {
    await expect(
      db.insert(schema.modThemes).values({ modVersionId: versionId, ...row } as never),
    ).rejects.toMatchObject(violates('mod_themes_kind_shape_check'))
  })
})

describe('mod_theme_desktop_previews', () => {
  it('goes with its theme', async () => {
    const themeId = await addDesktopTheme(db, versionId, { key: 'honu-lagoon' })

    await db.delete(schema.modThemes).where(eq(schema.modThemes.id, themeId))

    expect(
      await db
        .select()
        .from(schema.modThemeDesktopPreviews)
        .where(eq(schema.modThemeDesktopPreviews.themeId, themeId)),
    ).toEqual([])
  })

  it('refuses a second shot of one theme', async () => {
    const themeId = await addDesktopTheme(db, versionId, { key: 'koi-pond' })

    await expect(
      db.insert(schema.modThemeDesktopPreviews).values({ themeId, ...SEEDED_THEME_SHOT }),
    ).rejects.toMatchObject(violates('mod_theme_desktop_previews_theme_id_unique'))
  })

  it('refuses a card with no size', async () => {
    const themeId = await addDesktopTheme(db, versionId, { key: 'sea-sparkle', rendered: false })

    await expect(
      db
        .insert(schema.modThemeDesktopPreviews)
        .values({ themeId, ...SEEDED_THEME_SHOT, cardWidth: 0 }),
    ).rejects.toMatchObject(violates('mod_theme_desktop_previews_size_check'))
  })
})
