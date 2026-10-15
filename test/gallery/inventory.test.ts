import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { getPublishedInventory } from '@/gallery/inventory'

let client: PGlite
let db: ReturnType<typeof drizzle<typeof schema>>

beforeAll(async () => {
  client = new PGlite()
  db = drizzle({ client, schema })
  await migrate(db, { migrationsFolder: './drizzle' })
  await db.insert(schema.user).values({
    id: 'u1',
    name: 'Author',
    username: 'author',
    email: 'a@test.com',
    emailVerified: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  })
  await db.insert(schema.configs).values([
    {
      slug: 'copied-a',
      authorId: 'u1',
      status: 'published',
      copyCount: 3,
    },
    {
      slug: 'copied-b',
      authorId: 'u1',
      status: 'published',
      copyCount: 5,
    },
    {
      slug: 'draft-copy',
      authorId: 'u1',
      status: 'draft',
      copyCount: 99,
    },
  ])
  await db.insert(schema.mods).values([
    {
      slug: 'mod-a',
      pluginName: 'mod-a',
      title: 'A',
      authorGithub: 'octocat',
      status: 'published',
      copyCount: 4,
    },
    {
      slug: 'mod-b',
      pluginName: 'mod-b',
      title: 'B',
      authorGithub: 'octocat',
      status: 'removed',
      copyCount: 50,
    },
  ])
})

afterAll(async () => {
  await client.close()
})

describe('getPublishedInventory', () => {
  it('counts published status lines and mods and sums their copies, ignoring the rest', async () => {
    expect(await getPublishedInventory(db)).toEqual({ statusLines: 2, mods: 1, copyCount: 12 })
  })
})
