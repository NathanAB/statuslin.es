import { randomUUID } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { getVoteState } from '@/lib/vote-state'
import { toggleVote } from '@/votes/vote'

let client: PGlite
let db: ReturnType<typeof drizzle<typeof schema>>
beforeAll(async () => {
  client = new PGlite()
  db = drizzle({ client, schema })
  await migrate(db, { migrationsFolder: './drizzle' })
  // Seed users required by the votes FK (user_id → user.id) and the
  // configs author FK (author_id → user.id, the 'author' id below).
  await db
    .insert(schema.user)
    .values([
      {
        id: 'author',
        name: 'Author',
        email: 'author@test.com',
        emailVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'user-1',
        name: 'User One',
        email: 'user1@test.com',
        emailVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'user-2',
        name: 'User Two',
        email: 'user2@test.com',
        emailVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ])
    .onConflictDoNothing()
})
afterAll(async () => {
  await client.close()
})

async function makeConfig(slug: string, status = 'published'): Promise<string> {
  const rows = await db
    .insert(schema.configs)
    .values({
      slug,
      title: slug,
      description: '',
      authorId: 'author',
      interpreter: 'bash',
      status,
    })
    .returning()
  const cfg = rows[0]
  if (!cfg) throw new Error('insert failed')
  return cfg.id
}

describe('toggleVote', () => {
  it('adds a vote and increments the count, then removes it and decrements', async () => {
    const configId = await makeConfig('vote-a')
    const first = await toggleVote(db, 'user-1', configId)
    expect(first).toEqual({ voted: true, count: 1 })
    const afterAdd = await db.select().from(schema.configs).where(eq(schema.configs.id, configId))
    expect(afterAdd[0]?.upvoteCount).toBe(1)
    const second = await toggleVote(db, 'user-1', configId)
    expect(second).toEqual({ voted: false, count: 0 })
    const afterRemove = await db
      .select()
      .from(schema.configs)
      .where(eq(schema.configs.id, configId))
    expect(afterRemove[0]?.upvoteCount).toBe(0)
  })
  it('counts distinct users', async () => {
    const configId = await makeConfig('vote-b')
    await toggleVote(db, 'user-1', configId)
    const two = await toggleVote(db, 'user-2', configId)
    expect(two).toEqual({ voted: true, count: 2 })
  })
  it('getVoteState reports whether a user has voted', async () => {
    const configId = await makeConfig('vote-c')
    expect(await getVoteState(db, 'user-1', configId)).toBe(false)
    await toggleVote(db, 'user-1', configId)
    expect(await getVoteState(db, 'user-1', configId)).toBe(true)
  })
  it('returns {voted:false, count:0} and writes no row when config is draft', async () => {
    const configId = await makeConfig('vote-draft', 'draft')
    const result = await toggleVote(db, 'user-1', configId)
    expect(result).toEqual({ voted: false, count: 0 })
    const voteRows = await db.select().from(schema.votes).where(eq(schema.votes.configId, configId))
    expect(voteRows).toHaveLength(0)
    const cfgRows = await db.select().from(schema.configs).where(eq(schema.configs.id, configId))
    expect(cfgRows[0]?.upvoteCount).toBe(0)
  })
  it('returns {voted:false, count:0} and writes no row when config does not exist', async () => {
    const nonexistentId = randomUUID()
    const result = await toggleVote(db, 'user-1', nonexistentId)
    expect(result).toEqual({ voted: false, count: 0 })
    const voteRows = await db
      .select()
      .from(schema.votes)
      .where(eq(schema.votes.configId, nonexistentId))
    expect(voteRows).toHaveLength(0)
  })
})
