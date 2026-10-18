import type { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { getPublishedConfigs } from '@/gallery/config-items'
import { SCENARIOS } from '@/render/scenarios'
import { LOADTEST_AUTHORS, seedLoadConfigs } from '../../scripts/loadtest/seed'
import { teardownLoadConfigs } from '../../scripts/loadtest/teardown'
import { migratedPGlite } from '../helpers/test-db'

let client: PGlite
let db: ReturnType<typeof drizzle<typeof schema>>

beforeAll(async () => {
  client = await migratedPGlite()
  db = drizzle({ client, schema })
})
afterAll(async () => {
  await client.close()
})

const COUNT = 4

describe('teardownLoadConfigs', () => {
  it('removes all loadtest-* configs, their previews, and synthetic authors', async () => {
    await seedLoadConfigs(db, { count: COUNT })

    const summary = await teardownLoadConfigs(db)
    expect(summary.configs).toBe(COUNT)
    // previews are keyed by sha (no FK cascade), so teardown must delete them explicitly:
    // one row per scenario per config.
    expect(summary.previews).toBe(COUNT * SCENARIOS.length)
    expect(summary.authors).toBe(LOADTEST_AUTHORS.length)

    const cards = await getPublishedConfigs(db, 'new')
    expect(cards.filter((c) => c.slug.startsWith('loadtest-')).length).toBe(0)
    // Previews and synthetic authors are fully gone (this fresh db held only load-test data).
    expect((await db.select().from(schema.previews)).length).toBe(0)
    expect((await db.select().from(schema.user)).length).toBe(0)
  })

  it('is idempotent: a second teardown removes nothing', async () => {
    const summary = await teardownLoadConfigs(db)
    expect(summary.configs).toBe(0)
    expect(summary.previews).toBe(0)
    expect(summary.authors).toBe(0)
  })
})
