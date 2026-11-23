import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { getModReviewRows } from '@/review/mod-queue'
import { adminThemeDesktopPreviewPath } from '@/review/theme-desktop-preview'
import { insertPendingSubmission } from '@/submissions/record'
import {
  addDesktopTheme,
  addMod,
  addTheme,
  addVersion,
  openTestDb,
  SEEDED_THEME_PREVIEW,
  setCurrentVersion,
  sha,
  type TestDb,
} from '../mods/seed-mods'

let db: TestDb
let close: () => Promise<void>

beforeAll(async () => {
  ;({ db, close } = await openTestDb())
  await db.insert(schema.user).values({
    id: 'submitter',
    name: 'Ada',
    username: 'ada',
    email: 'ada@test.com',
    emailVerified: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  })
})
beforeEach(async () => {
  await db.delete(schema.mods)
})
afterAll(async () => {
  await close()
})

async function submitPlugin(slug: string, commit: string) {
  const modId = await addMod(db, slug, 'draft')
  const versionId = await addVersion(db, modId, { commitSha: sha(commit), versionNumber: 1 })
  await setCurrentVersion(db, modId, versionId)
  await insertPendingSubmission(db, { kind: 'mod', versionId, submittedBy: 'submitter' })
  return versionId
}

const SOURCE =
  '{\n  "name": "Paper",\n  "base": "light",\n  "overrides": { "claude": "#d97757" }\n}\n'

describe('getModReviewRows themes', () => {
  it('lists each theme of the submitted version with its exact file and preview, by name', async () => {
    const versionId = await submitPlugin('pack', 'a')
    await addTheme(db, versionId, { key: 'paper', name: 'Paper', window: 'light', source: SOURCE })
    await addTheme(db, versionId, { key: 'night', name: 'Night', rendered: false })

    const [row] = await getModReviewRows(db)

    expect(row?.themes).toEqual([
      {
        id: expect.any(String),
        kind: 'terminal',
        key: 'night',
        name: 'Night',
        window: 'dark',
        source: JSON.stringify({ name: 'Night', base: 'dark', overrides: {} }),
        preview: null,
      },
      {
        id: expect.any(String),
        kind: 'terminal',
        key: 'paper',
        name: 'Paper',
        window: 'light',
        source: SOURCE,
        preview: SEEDED_THEME_PREVIEW.segments,
      },
    ])
    expect(row?.rendered).toBe(false)
  })

  it('lists each Desktop theme with its switch steps and its whole-window shot, or none before it renders', async () => {
    const versionId = await submitPlugin('theme-examples', 'a')
    const reef = await addDesktopTheme(db, versionId, {
      key: 'night-reef',
      name: 'Night Reef',
      switchSteps: ['/custom-theme night-reef'],
    })
    const rainy = await addDesktopTheme(db, versionId, {
      key: 'rainy',
      name: 'Rainy Window',
      window: 'light',
      switchSteps: [],
      rendered: false,
    })

    const [row] = await getModReviewRows(db)

    expect(row?.themes).toEqual([
      {
        id: reef,
        kind: 'desktop',
        key: 'night-reef',
        name: 'Night Reef',
        window: 'dark',
        switchSteps: ['/custom-theme night-reef'],
        preview: { src: adminThemeDesktopPreviewPath(reef), width: 1100, height: 900 },
      },
      {
        id: rainy,
        kind: 'desktop',
        key: 'rainy',
        name: 'Rainy Window',
        window: 'light',
        switchSteps: [],
        preview: null,
      },
    ])
  })

  it("keeps each version's themes on its own row", async () => {
    const first = await submitPlugin('pack', 'a')
    const second = await submitPlugin('other', 'b')
    await addTheme(db, first, { key: 'paper' })
    await addTheme(db, second, { key: 'night' })

    const rows = await getModReviewRows(db)

    const keysOf = (slug: string) =>
      rows.find((row) => row.mod.slug === slug)?.themes.map((theme) => theme.key)
    expect(keysOf('pack')).toEqual(['paper'])
    expect(keysOf('other')).toEqual(['night'])
  })

  it('gives a mod without themes an empty list', async () => {
    await submitPlugin('meter', 'a')

    expect((await getModReviewRows(db))[0]?.themes).toEqual([])
  })
})
