import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { addPublishedConfig } from '../gallery/seed-configs'
import { openTestDb, type TestDb } from '../mods/seed-mods'

let db: TestDb
let close: () => Promise<void>
let seeded = 0

beforeAll(async () => {
  ;({ db, close } = await openTestDb())
})
afterAll(async () => {
  await close()
})

async function insertVersion(): Promise<string> {
  const configId = await addPublishedConfig(db, `c${++seeded}`)
  const [config] = await db
    .select({ versionId: schema.configs.currentVersionId })
    .from(schema.configs)
    .where(eq(schema.configs.id, configId))
  return config?.versionId as string
}

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 255])
const VERSIONS = { desktopVersion: '1.0.0', engineVersion: '2.1.0', modCommitSha: 'a'.repeat(40) }
const SHOT = { kind: 'shot' as const, png: PNG, width: 790, height: 40, ...VERSIONS }
const NOTHING = { kind: 'nothing' as const, png: null, width: null, height: null, ...VERSIONS }

async function insert(row: Partial<typeof schema.configDesktopPreviews.$inferInsert>) {
  const configVersionId = await insertVersion()
  await db.insert(schema.configDesktopPreviews).values({
    ...SHOT,
    ...row,
    configVersionId,
  } as typeof schema.configDesktopPreviews.$inferInsert)
  return configVersionId
}

const violates = (constraint: string) => ({ cause: { constraint } })

describe('config_desktop_previews', () => {
  it('keeps a shot PNG byte for byte', async () => {
    const versionId = await insert(SHOT)

    const [row] = await db
      .select()
      .from(schema.configDesktopPreviews)
      .where(eq(schema.configDesktopPreviews.configVersionId, versionId))
    expect(row).toMatchObject(SHOT)
    expect(Array.from(row?.png ?? [])).toEqual(Array.from(PNG))
  })

  it('accepts a status line that drew nothing', async () => {
    await expect(insert(NOTHING)).resolves.toEqual(expect.any(String))
  })

  it.each([
    ['a shot with no PNG', { png: null }],
    ['a shot with no width', { width: null }],
    ['a shot with a zero height', { height: 0 }],
    ['nothing with a PNG', { ...NOTHING, png: PNG }],
    ['nothing with a size', { ...NOTHING, width: 790 }],
    ['an unknown kind', { kind: 'video' }],
  ])('rejects %s', async (_name, row) => {
    await expect(insert(row as never)).rejects.toMatchObject(
      violates('config_desktop_previews_kind_check'),
    )
  })

  it('rejects a second result for the same version', async () => {
    const configVersionId = await insert(SHOT)

    await expect(
      db.insert(schema.configDesktopPreviews).values({ ...NOTHING, configVersionId }),
    ).rejects.toMatchObject(violates('config_desktop_previews_config_version_id_unique'))
  })

  it('goes with its version', async () => {
    const versionId = await insert(SHOT)

    await db.delete(schema.configVersions).where(eq(schema.configVersions.id, versionId))

    expect(
      await db
        .select()
        .from(schema.configDesktopPreviews)
        .where(eq(schema.configDesktopPreviews.configVersionId, versionId)),
    ).toEqual([])
  })
})
