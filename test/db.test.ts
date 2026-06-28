import { PGlite } from '@electric-sql/pglite'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as schema from '@/db/auth-schema'

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

describe('users/auth schema', () => {
  it('inserts and reads back a user row', async () => {
    await db.insert(schema.user).values({
      id: 'u1',
      name: 'Ada',
      email: 'ada@example.com',
      emailVerified: false,
    })
    const rows = await db.select().from(schema.user).where(eq(schema.user.id, 'u1'))
    expect(rows).toHaveLength(1)
    const row = rows[0]
    expect(row?.email).toBe('ada@example.com')
  })
})
