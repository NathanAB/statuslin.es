import type { PGlite } from '@electric-sql/pglite'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { migratedPGlite } from '../helpers/test-db'

let client: PGlite
let db: ReturnType<typeof drizzle<typeof schema>>
let seeded = 0

beforeAll(async () => {
  client = await migratedPGlite()
  db = drizzle({ client, schema })
})
afterAll(async () => {
  await client.close()
})

async function insertVersion(): Promise<string> {
  seeded++
  const [mod] = await db
    .insert(schema.mods)
    .values({
      slug: `m${seeded}`,
      pluginName: `m${seeded}`,
      title: 'm',
      authorGithub: 'octocat',
    })
    .returning()
  const [version] = await db
    .insert(schema.modVersions)
    .values({
      modId: mod?.id as string,
      versionNumber: 1,
      repoUrl: 'https://github.com/octocat/mods',
      commitSha: seeded.toString(16).padStart(40, '0'),
      footprint: { events: [], calls: [] },
      validatedWith: '2.1.0',
    })
    .returning()
  return version?.id as string
}

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 255])
const CARD_PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 254])
const VERSIONS = { desktopVersion: '1.0.0', engineVersion: '2.1.0' }
const SHOT = {
  scenarioKey: 'clean-main',
  kind: 'shot' as const,
  png: PNG,
  width: 790,
  height: 52,
  cardPng: CARD_PNG,
  cardWidth: 790,
  cardHeight: 40,
  ...VERSIONS,
}
const NOTHING = {
  scenarioKey: 'clean-main',
  kind: 'nothing' as const,
  png: null,
  width: null,
  height: null,
  cardPng: null,
  cardWidth: null,
  cardHeight: null,
  ...VERSIONS,
}

async function insert(row: Partial<typeof schema.modDesktopPreviews.$inferInsert>) {
  const modVersionId = await insertVersion()
  await db
    .insert(schema.modDesktopPreviews)
    .values({ ...SHOT, ...row, modVersionId } as typeof schema.modDesktopPreviews.$inferInsert)
  return modVersionId
}

const violates = (constraint: string) => ({ cause: { constraint } })

describe('mod_desktop_previews', () => {
  it('keeps a shot PNG and its card PNG byte for byte', async () => {
    const versionId = await insert(SHOT)

    const [row] = await db
      .select()
      .from(schema.modDesktopPreviews)
      .where(eq(schema.modDesktopPreviews.modVersionId, versionId))
    expect(row).toMatchObject({ ...SHOT, png: PNG, cardPng: CARD_PNG })
    expect(Array.from(row?.png ?? [])).toEqual(Array.from(PNG))
    expect(Array.from(row?.cardPng ?? [])).toEqual(Array.from(CARD_PNG))
  })

  it('accepts a mod that drew nothing', async () => {
    await expect(insert(NOTHING)).resolves.toEqual(expect.any(String))
  })

  it.each([
    ['a shot with no PNG', { png: null }],
    ['a shot with no width', { width: null }],
    ['a shot with a zero height', { height: 0 }],
    ['a shot with no card PNG', { cardPng: null }],
    ['a shot with no card width', { cardWidth: null }],
    ['a shot with a zero card height', { cardHeight: 0 }],
    ['nothing with a PNG', { ...NOTHING, png: PNG }],
    ['nothing with a size', { ...NOTHING, width: 790 }],
    ['nothing with a card PNG', { ...NOTHING, cardPng: CARD_PNG }],
    ['nothing with a card size', { ...NOTHING, cardHeight: 40 }],
    ['an unknown kind', { kind: 'video' }],
  ])('rejects %s', async (_name, row) => {
    await expect(insert(row as never)).rejects.toMatchObject(
      violates('mod_desktop_previews_kind_check'),
    )
  })

  it('rejects a second result for the same version and scenario', async () => {
    const modVersionId = await insert(SHOT)

    await expect(
      db.insert(schema.modDesktopPreviews).values({ ...NOTHING, modVersionId }),
    ).rejects.toMatchObject(violates('mod_desktop_previews_version_scenario_uq'))
  })

  it('goes with its version', async () => {
    const versionId = await insert(SHOT)

    await db.delete(schema.modVersions).where(eq(schema.modVersions.id, versionId))

    expect(
      await db
        .select()
        .from(schema.modDesktopPreviews)
        .where(eq(schema.modDesktopPreviews.modVersionId, versionId)),
    ).toEqual([])
  })
})
