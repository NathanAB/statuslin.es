import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { versionIsRendered } from '@/mods/queries'
import { getPublishedModThemes } from '@/themes/queries'
import { themesToRecord } from '@/themes/record-previews'
import { unlistTheme } from '../../scripts/unlist-theme'
import {
  addDesktopTheme,
  addMod,
  addTheme,
  addVersion,
  openTestDb,
  setCurrentVersion,
  sha,
  type TestDb,
} from '../mods/seed-mods'

let db: TestDb
let close: () => Promise<void>

beforeAll(async () => {
  ;({ db, close } = await openTestDb())
})
afterAll(async () => {
  await close()
})
beforeEach(async () => {
  await db.delete(schema.mods)
})

const REASON = 'only changes colours the theme scene never draws'

/** A theme pack whose `mono` theme could not be recorded, so it has no preview. */
async function pack(status: schema.ModStatus = 'draft') {
  const modId = await addMod(db, 'pack', status)
  const versionId = await addVersion(db, modId, { commitSha: sha('a'), versionNumber: 1 })
  await setCurrentVersion(db, modId, versionId)
  await addTheme(db, versionId, { key: 'ocean' })
  await addTheme(db, versionId, { key: 'mono', rendered: false })
  return { modId, versionId }
}

async function rendered(versionId: string): Promise<boolean> {
  const rows = await db
    .select({ id: schema.modVersions.id })
    .from(schema.modVersions)
    .where(versionIsRendered)
  return rows.some((row) => row.id === versionId)
}

const reasons = () =>
  db
    .select({ key: schema.modThemes.key, reason: schema.modThemes.unlistedReason })
    .from(schema.modThemes)
    .orderBy(schema.modThemes.key)

describe('unlistTheme', () => {
  it("lets the rest of the plugin publish once the theme that can't be recorded is unlisted, keeping the reason", async () => {
    const { versionId } = await pack()
    expect(await rendered(versionId)).toBe(false)

    await unlistTheme(db, { slug: 'pack', key: 'mono', reason: REASON })

    expect(await rendered(versionId)).toBe(true)
    expect(await reasons()).toEqual([
      { key: 'mono', reason: REASON },
      { key: 'ocean', reason: null },
    ])
  })

  it('leaves the theme out of every later render:mods run, even one that records every theme again', async () => {
    const { versionId } = await pack()

    await unlistTheme(db, { slug: 'pack', key: 'mono', reason: REASON })

    const recorded = await themesToRecord(db, versionId, { rerecord: true })
    expect(recorded.map(({ key }) => key)).toEqual(['ocean'])
  })

  it('takes away a card the theme already had', async () => {
    await pack('published')

    await unlistTheme(db, { slug: 'pack', key: 'ocean', reason: REASON })

    expect(await getPublishedModThemes(db, 'pack')).toEqual([])
  })

  it('unlists the theme on the newest version, the one render:mods and publish work on', async () => {
    const { modId } = await pack('published')
    const newest = await addVersion(db, modId, { commitSha: sha('b'), versionNumber: 2 })
    await addTheme(db, newest, { key: 'mono', rendered: false })

    expect(await unlistTheme(db, { slug: 'pack', key: 'mono', reason: REASON })).toEqual({
      versionNumber: 2,
    })

    const unlisted = await db
      .select({ versionId: schema.modThemes.modVersionId })
      .from(schema.modThemes)
      .where(eq(schema.modThemes.unlistedReason, REASON))
    expect(unlisted).toEqual([{ versionId: newest }])
  })

  it.each([
    ['an empty reason', { key: 'mono', reason: '  ' }, 'give the reason the theme is left out'],
    [
      'a key the plugin has no theme for',
      { key: 'sunset', reason: REASON },
      'no terminal theme "sunset" on pack v1',
    ],
    ['a Desktop theme', { key: 'night', reason: REASON }, 'no terminal theme "night" on pack v1'],
  ])('refuses %s and changes nothing', async (_name, request, message) => {
    const { versionId } = await pack()
    await addDesktopTheme(db, versionId, { key: 'night' })

    await expect(unlistTheme(db, { slug: 'pack', ...request })).rejects.toThrow(message)

    expect((await reasons()).every(({ reason }) => reason === null)).toBe(true)
  })

  it('refuses a slug with no mod', async () => {
    await expect(unlistTheme(db, { slug: 'nothing', key: 'mono', reason: REASON })).rejects.toThrow(
      'no mod with slug "nothing" has a version',
    )
  })
})
