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
      title: 'A',
      description: 'desc',
      authorId: 'u1',
      interpreter: 'bash',
      status: 'published',
      copyCount: 3,
    },
    {
      slug: 'copied-b',
      title: 'B',
      description: 'desc',
      authorId: 'u1',
      interpreter: 'bash',
      status: 'published',
      copyCount: 5,
    },
    {
      slug: 'draft-copy',
      title: 'Draft',
      description: '',
      authorId: 'u1',
      interpreter: 'bash',
      status: 'draft',
      copyCount: 99,
    },
  ])
})

afterAll(async () => {
  await client.close()
})

describe('getPublishedInventory', () => {
  it('sums published configs and their copy counts, ignoring drafts', async () => {
    expect(await getPublishedInventory(db)).toEqual({ count: 2, copyCount: 8 })
  })
})
