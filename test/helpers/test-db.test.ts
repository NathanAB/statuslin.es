import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { migratedPGlite } from './test-db'

const TABLES = `SELECT table_schema || '.' || table_name AS name FROM information_schema.tables
  WHERE table_schema NOT IN ('pg_catalog', 'information_schema') ORDER BY name`
const APPLIED_MIGRATIONS = 'SELECT hash FROM drizzle.__drizzle_migrations ORDER BY id'

async function column(client: PGlite, sql: string): Promise<unknown[]> {
  const { rows } = await client.query<Record<string, unknown>>(sql)
  return rows.map((row) => Object.values(row)[0])
}

describe('migratedPGlite', () => {
  let freshlyMigrated: PGlite
  let fromSnapshot: PGlite

  beforeAll(async () => {
    freshlyMigrated = new PGlite()
    await migrate(drizzle({ client: freshlyMigrated }), { migrationsFolder: './drizzle' })
    fromSnapshot = await migratedPGlite()
  })
  afterAll(async () => {
    await freshlyMigrated.close()
    await fromSnapshot.close()
  })

  it('has every table and migration the committed migrations create', async () => {
    const tables = await column(freshlyMigrated, TABLES)
    expect(tables).toContain('public.configs')
    expect(await column(fromSnapshot, TABLES)).toEqual(tables)
    expect(await column(fromSnapshot, APPLIED_MIGRATIONS)).toEqual(
      await column(freshlyMigrated, APPLIED_MIGRATIONS),
    )
  })

  it('gives each call its own database', async () => {
    const other = await migratedPGlite()
    await fromSnapshot.exec(`INSERT INTO "user" (id, name, email) VALUES ('u1', 'A', 'a@test.com')`)
    expect(await column(other, 'SELECT id FROM "user"')).toEqual([])
    await other.close()
  })
})
