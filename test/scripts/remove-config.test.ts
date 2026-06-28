import { PGlite } from '@electric-sql/pglite'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { getConfigBySlug } from '@/gallery/queries'
import { removeConfig, restoreConfig } from '../../scripts/remove-config'

let client: PGlite
let db: ReturnType<typeof drizzle<typeof schema>>

beforeAll(async () => {
  client = new PGlite()
  db = drizzle({ client, schema })
  await migrate(db, { migrationsFolder: './drizzle' })
  await db.insert(schema.user).values({
    id: 'takedown-author',
    name: 'Takedown Author',
    email: 'takedown@test.com',
    emailVerified: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  })
})
afterAll(async () => {
  await client.close()
})

/** Insert a config with a given slug + status. Returns its id. */
async function seedConfig(slug: string, status: string): Promise<string> {
  const [row] = await db
    .insert(schema.configs)
    .values({
      slug,
      title: `Config ${slug}`,
      description: '',
      authorId: 'takedown-author',
      interpreter: 'bash',
      status,
    })
    .returning()
  return row?.id as string
}

/** Insert a published config wired to a real current version, so getConfigBySlug returns it. */
async function seedPublishedWithVersion(slug: string): Promise<void> {
  const configId = await seedConfig(slug, 'published')
  const [version] = await db
    .insert(schema.configVersions)
    .values({
      configId,
      versionNumber: 1,
      source: '#!/bin/bash\necho hi',
      interpreter: 'bash',
      contentSha256: `sha-${slug}`,
      status: 'approved',
    })
    .returning()
  await db
    .update(schema.configs)
    .set({ currentVersionId: version?.id })
    .where(eq(schema.configs.id, configId))
}

async function statusOf(slug: string): Promise<string | undefined> {
  const [row] = await db
    .select({ status: schema.configs.status })
    .from(schema.configs)
    .where(eq(schema.configs.slug, slug))
  return row?.status
}

describe('removeConfig', () => {
  it('flips a published config to removed and reports the previous status', async () => {
    await seedConfig('rm-live', 'published')

    const result = await removeConfig(db, 'rm-live')

    expect(result).toEqual({ slug: 'rm-live', previousStatus: 'published' })
    expect(await statusOf('rm-live')).toBe('removed')
  })

  it('throws when the slug does not exist, and the message names the slug', async () => {
    await expect(removeConfig(db, 'no-such-slug')).rejects.toThrow(/no config .*no-such-slug/i)
  })

  it('throws and changes nothing when the config is a draft (never published)', async () => {
    await seedConfig('rm-draft', 'draft')

    await expect(removeConfig(db, 'rm-draft')).rejects.toThrow(/draft.*not published/i)
    expect(await statusOf('rm-draft')).toBe('draft')
  })

  it('throws and changes nothing when the config is already removed', async () => {
    await seedConfig('rm-already', 'removed')

    await expect(removeConfig(db, 'rm-already')).rejects.toThrow(/removed.*not published/i)
    expect(await statusOf('rm-already')).toBe('removed')
  })

  it('only affects the targeted config, not other published configs', async () => {
    await seedConfig('rm-target', 'published')
    await seedConfig('rm-bystander', 'published')

    await removeConfig(db, 'rm-target')

    expect(await statusOf('rm-target')).toBe('removed')
    expect(await statusOf('rm-bystander')).toBe('published')
  })
})

describe('restoreConfig', () => {
  it('flips a removed config back to published and reports the previous status', async () => {
    await seedConfig('rs-gone', 'removed')

    const result = await restoreConfig(db, 'rs-gone')

    expect(result).toEqual({ slug: 'rs-gone', previousStatus: 'removed' })
    expect(await statusOf('rs-gone')).toBe('published')
  })

  it('throws and changes nothing when the config is currently published (not removed)', async () => {
    await seedConfig('rs-live', 'published')

    await expect(restoreConfig(db, 'rs-live')).rejects.toThrow(/published.*not removed/i)
    expect(await statusOf('rs-live')).toBe('published')
  })

  it('throws when the slug does not exist', async () => {
    await expect(restoreConfig(db, 'rs-ghost')).rejects.toThrow(/no config .*rs-ghost/i)
  })
})

describe('takedown end-to-end via the real read path', () => {
  it('removes a config from getConfigBySlug, and restore brings it back', async () => {
    await seedPublishedWithVersion('e2e-config')
    expect(await getConfigBySlug(db, 'e2e-config')).not.toBeNull()

    await removeConfig(db, 'e2e-config')
    expect(await getConfigBySlug(db, 'e2e-config')).toBeNull()

    await restoreConfig(db, 'e2e-config')
    expect(await getConfigBySlug(db, 'e2e-config')).not.toBeNull()
  })
})
