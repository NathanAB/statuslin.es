import { PGlite } from '@electric-sql/pglite'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'

let client: PGlite
let db: ReturnType<typeof drizzle<typeof schema>>

beforeAll(async () => {
  client = new PGlite()
  db = drizzle({ client, schema })
  await migrate(db, { migrationsFolder: './drizzle' })
})
afterAll(async () => {
  await client.close()
})

describe('delete-user cascade across configs → versions → render jobs', () => {
  it('removes config versions and render jobs when the author user is deleted', async () => {
    await db.insert(schema.user).values({
      id: 'cascade-author',
      name: 'Cascade Author',
      email: 'cascade@test.com',
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const [config] = await db
      .insert(schema.configs)
      .values({
        slug: 'cascade-config',
        title: 'Cascade Config',
        description: '',
        authorId: 'cascade-author',
        interpreter: 'bash',
        status: 'published',
      })
      .returning()
    const configId = config?.id as string

    const [version] = await db
      .insert(schema.configVersions)
      .values({
        configId,
        versionNumber: 1,
        source: '#!/bin/bash\necho hi',
        interpreter: 'bash',
        contentSha256: 'sha-cascade',
        status: 'approved',
      })
      .returning()
    const versionId = version?.id as string

    await db.insert(schema.renderJobs).values({
      configVersionId: versionId,
      status: 'queued',
    })

    // Sanity: rows exist before the delete.
    expect(
      await db.select().from(schema.configs).where(eq(schema.configs.id, configId)),
    ).toHaveLength(1)
    expect(
      await db.select().from(schema.configVersions).where(eq(schema.configVersions.id, versionId)),
    ).toHaveLength(1)
    expect(
      await db
        .select()
        .from(schema.renderJobs)
        .where(eq(schema.renderJobs.configVersionId, versionId)),
    ).toHaveLength(1)

    // Delete the user. configs cascades off user; versions cascade off configs;
    // render jobs cascade off versions. Everything downstream must be gone.
    await db.delete(schema.user).where(eq(schema.user.id, 'cascade-author'))

    expect(
      await db.select().from(schema.configs).where(eq(schema.configs.id, configId)),
    ).toHaveLength(0)
    expect(
      await db.select().from(schema.configVersions).where(eq(schema.configVersions.id, versionId)),
    ).toHaveLength(0)
    expect(
      await db
        .select()
        .from(schema.renderJobs)
        .where(eq(schema.renderJobs.configVersionId, versionId)),
    ).toHaveLength(0)
  })
})
