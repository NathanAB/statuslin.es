import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { getCuratedThemeRows } from '@/review/curated-theme-queue'
import { insertPendingSubmission } from '@/submissions/record'
import {
  addDesktopTheme,
  addMod,
  addTheme,
  addVersion,
  openTestDb,
  REPO_URL,
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

/** A curated plugin (no submission) with one version per commit, the first one current. */
async function curated(slug: string, status: schema.ModStatus, commits: string[]) {
  const modId = await addMod(db, slug, status)
  const versionIds: string[] = []
  for (const [i, commit] of commits.entries()) {
    versionIds.push(await addVersion(db, modId, { commitSha: sha(commit), versionNumber: i + 1 }))
  }
  await setCurrentVersion(db, modId, versionIds[0] as string)
  return { modId, versionIds }
}

const slugs = async () => (await getCuratedThemeRows(db)).map((row) => row.mod.slug)

describe('getCuratedThemeRows', () => {
  it('lists a curated draft whose newest version carries themes, with the commit and every theme', async () => {
    const { versionIds } = await curated('pack', 'draft', ['a', 'b'])
    await addTheme(db, versionIds[1] as string, { key: 'paper', name: 'Paper' })
    await addTheme(db, versionIds[1] as string, { key: 'night', name: 'Night', rendered: false })

    const rows = await getCuratedThemeRows(db)

    expect(rows).toEqual([
      {
        mod: { slug: 'pack', title: 'pack', authorGithub: 'octocat', status: 'draft' },
        version: {
          id: versionIds[1],
          versionNumber: 2,
          repoUrl: REPO_URL,
          path: '',
          commitSha: sha('b'),
        },
        rendered: false,
        themes: [
          expect.objectContaining({ key: 'night', preview: null }),
          expect.objectContaining({ key: 'paper', preview: SEEDED_THEME_PREVIEW.segments }),
        ],
      },
    ])
  })

  it('lists a curated draft that carries only Desktop themes, rendered once each has its shot', async () => {
    const { versionIds } = await curated('theme-examples', 'draft', ['a'])
    const versionId = versionIds[0] as string
    await addDesktopTheme(db, versionId, { key: 'night-reef', name: 'Night Reef' })

    const [row] = await getCuratedThemeRows(db)
    expect(row?.themes).toEqual([
      expect.objectContaining({
        kind: 'desktop',
        key: 'night-reef',
        switchSteps: expect.any(Array),
      }),
    ])
    expect(row?.rendered).toBe(true)

    await addDesktopTheme(db, versionId, { key: 'honu', name: 'Honu', rendered: false })
    expect((await getCuratedThemeRows(db))[0]?.rendered).toBe(false)
  })

  it('says a draft is rendered once every theme has its preview', async () => {
    const { versionIds } = await curated('pack', 'draft', ['a'])
    await addTheme(db, versionIds[0] as string, { key: 'paper' })

    expect((await getCuratedThemeRows(db))[0]?.rendered).toBe(true)
  })

  it('lists a published plugin whose newer version carries themes, before it is re-pinned', async () => {
    const { versionIds } = await curated('pack', 'published', ['a', 'b'])
    await addTheme(db, versionIds[1] as string, { key: 'paper' })

    expect(await slugs()).toEqual(['pack'])
  })

  it('leaves out a published plugin whose live version is its newest', async () => {
    const { versionIds } = await curated('pack', 'published', ['a'])
    await addTheme(db, versionIds[0] as string, { key: 'paper' })

    expect(await slugs()).toEqual([])
  })

  it('leaves out a curated draft without themes, and a draft whose themes are on an older version', async () => {
    await curated('meter', 'draft', ['a'])
    const { versionIds } = await curated('old', 'draft', ['b', 'c'])
    await addTheme(db, versionIds[0] as string, { key: 'paper' })

    expect(await slugs()).toEqual([])
  })

  it('leaves out a submitted plugin, which its own card reviews', async () => {
    const { versionIds } = await curated('pack', 'draft', ['a'])
    const versionId = versionIds[0] as string
    await addTheme(db, versionId, { key: 'paper' })
    await insertPendingSubmission(db, { kind: 'mod', versionId, submittedBy: 'submitter' })

    expect(await slugs()).toEqual([])
  })

  it('leaves out a removed plugin', async () => {
    const { versionIds } = await curated('pack', 'removed', ['a'])
    await addTheme(db, versionIds[0] as string, { key: 'paper' })

    expect(await slugs()).toEqual([])
  })
})
