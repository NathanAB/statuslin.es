import { randomUUID } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { recordCopy } from '@/adopt/copy'
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
      id: 'author',
      name: 'Author',
      email: 'author@test.com',
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoNothing()
})
afterAll(async () => {
  await client.close()
})

async function makeConfig(
  slug: string,
  status: 'published' | 'draft' | 'pending' = 'published',
): Promise<string> {
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

describe('recordCopy', () => {
  it('increments copyCount and returns the new value', async () => {
    const configId = await makeConfig('copy-a')
    expect(await recordCopy(db, configId, 'ip-1')).toBe(1)
    expect(await recordCopy(db, configId, 'ip-2')).toBe(2)
    const rows = await db.select().from(schema.configs).where(eq(schema.configs.id, configId))
    expect(rows[0]?.copyCount).toBe(2)
  })
  it('returns 0 without throwing when the config does not exist', async () => {
    const nonexistentId = randomUUID()
    expect(await recordCopy(db, nonexistentId, 'ip-1')).toBe(0)
  })
  it('returns 0 without throwing when the id is not a valid uuid', async () => {
    expect(await recordCopy(db, 'not-a-uuid', 'ip-1')).toBe(0)
  })
  it('does not increment non-published configs', async () => {
    const configId = await makeConfig('copy-draft', 'draft')
    expect(await recordCopy(db, configId, 'ip-1')).toBe(0)
    const rows = await db.select().from(schema.configs).where(eq(schema.configs.id, configId))
    expect(rows[0]?.copyCount).toBe(0)
  })
  it('counts at most once per ip per config (dedup by ip hash)', async () => {
    const configId = await makeConfig('copy-dedup')
    expect(await recordCopy(db, configId, 'ip-hash-A')).toBe(1)
    // same ip again → no second increment
    expect(await recordCopy(db, configId, 'ip-hash-A')).toBe(1)
    // a different ip → counts
    expect(await recordCopy(db, configId, 'ip-hash-B')).toBe(2)
    const rows = await db.select().from(schema.configs).where(eq(schema.configs.id, configId))
    expect(rows[0]?.copyCount).toBe(2)
  })
  it('dedup is per-config: the same ip still counts on a different config', async () => {
    const a = await makeConfig('copy-per-a')
    const b = await makeConfig('copy-per-b')
    expect(await recordCopy(db, a, 'same-ip')).toBe(1)
    expect(await recordCopy(db, a, 'same-ip')).toBe(1) // deduped on a
    expect(await recordCopy(db, b, 'same-ip')).toBe(1) // counts on b
  })
  it('a null ip (no trustworthy client IP) returns the count without counting or recording', async () => {
    const configId = await makeConfig('copy-noip')
    expect(await recordCopy(db, configId, 'ip-x')).toBe(1) // one real copy
    expect(await recordCopy(db, configId, null)).toBe(1) // null → current count, no increment
    expect(await recordCopy(db, configId, null)).toBe(1)
    const cfg = await db.select().from(schema.configs).where(eq(schema.configs.id, configId))
    expect(cfg[0]?.copyCount).toBe(1)
    // the null calls wrote no copy_events row — only the one real copy did
    const events = await db
      .select()
      .from(schema.copyEvents)
      .where(eq(schema.copyEvents.configId, configId))
    expect(events.length).toBe(1)
  })
})
