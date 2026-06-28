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
  // Seed the author referenced by the configs FK (author_id → user.id)
  await db
    .insert(schema.user)
    .values({
      id: 'u1',
      name: 'Author One',
      email: 'author1@test.com',
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoNothing()
})
afterAll(async () => {
  await client.close()
})

describe('config schema', () => {
  it('stores a config, version, and render job', async () => {
    const cfgRows = await db
      .insert(schema.configs)
      .values({
        slug: 's1',
        title: 'Mine',
        authorId: 'u1',
        interpreter: 'bash',
      })
      .returning()
    const cfg = cfgRows[0]
    if (!cfg) throw new Error('insert configs returned no row')
    const verRows = await db
      .insert(schema.configVersions)
      .values({
        configId: cfg.id,
        versionNumber: 1,
        source: '#!/bin/bash',
        interpreter: 'bash',
        contentSha256: 'abc',
      })
      .returning()
    const ver = verRows[0]
    if (!ver) throw new Error('insert configVersions returned no row')
    await db.insert(schema.renderJobs).values({ configVersionId: ver.id })
    const jobs = await db
      .select()
      .from(schema.renderJobs)
      .where(eq(schema.renderJobs.configVersionId, ver.id))
    expect(jobs[0]?.status).toBe('queued')
  })
  it('rejects a duplicate (config_id, version_number)', async () => {
    const dupCfgRows = await db
      .insert(schema.configs)
      .values({
        slug: 's2',
        title: 'Dup',
        authorId: 'u1',
        interpreter: 'bash',
      })
      .returning()
    const cfg = dupCfgRows[0]
    if (!cfg) throw new Error('insert configs returned no row')
    const v = {
      configId: cfg.id,
      versionNumber: 1,
      source: 'x',
      interpreter: 'bash',
      contentSha256: 'h',
    }
    await db.insert(schema.configVersions).values(v)
    await expect(db.insert(schema.configVersions).values(v)).rejects.toThrow()
  })
})
