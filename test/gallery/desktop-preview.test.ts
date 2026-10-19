import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { getConfigBySlug } from '@/gallery/queries'
import { configDesktopPreviewPath } from '@/lib/site'
import { openTestDb, type TestDb } from '../mods/seed-mods'
import { addConfigDesktopPreview, addPublishedConfig, currentVersionOf } from './seed-configs'

let db: TestDb
let close: () => Promise<void>

beforeAll(async () => {
  ;({ db, close } = await openTestDb())
})
afterAll(async () => {
  await close()
})

describe("a status line page's Desktop preview", () => {
  it('is its shot at its CSS size, under the URL of the render that made it', async () => {
    const versionId = await currentVersionOf(db, await addPublishedConfig(db, 'shot'))
    await addConfigDesktopPreview(db, versionId)
    const [row] = await db
      .select({ createdAt: schema.configDesktopPreviews.createdAt })
      .from(schema.configDesktopPreviews)
      .where(eq(schema.configDesktopPreviews.configVersionId, versionId))

    expect((await getConfigBySlug(db, 'shot'))?.desktop).toEqual({
      kind: 'shot',
      shot: {
        src: configDesktopPreviewPath(versionId, row?.createdAt as Date),
        width: 790,
        height: 40,
      },
    })
  })

  it('is that it drew nothing there', async () => {
    const versionId = await currentVersionOf(db, await addPublishedConfig(db, 'blank'))
    await addConfigDesktopPreview(db, versionId, 'nothing')

    expect((await getConfigBySlug(db, 'blank'))?.desktop).toEqual({ kind: 'nothing' })
  })

  it('is null before it is recorded', async () => {
    await addPublishedConfig(db, 'unrecorded')

    expect((await getConfigBySlug(db, 'unrecorded'))?.desktop).toBeNull()
  })
})
