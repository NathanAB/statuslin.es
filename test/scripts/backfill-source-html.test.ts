import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterAll, beforeAll, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { backfillSourceHtml } from '../../scripts/backfill-source-html'

let client: PGlite
let db: ReturnType<typeof drizzle<typeof schema>>

beforeAll(async () => {
  client = new PGlite()
  db = drizzle({ client, schema })
  await migrate(db, { migrationsFolder: './drizzle' })
  await db.insert(schema.user).values({
    id: 'bf-user',
    name: 'BF',
    email: 'bf@test.com',
    emailVerified: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  })
  const [cfg] = await db
    .insert(schema.configs)
    .values({
      slug: 'bf-cfg',
      title: 'BF',
      description: '',
      authorId: 'bf-user',
      interpreter: 'bash',
      status: 'published',
    })
    .returning()
  await db.insert(schema.configVersions).values([
    {
      configId: cfg!.id,
      versionNumber: 1,
      source: 'echo needs-highlight',
      interpreter: 'bash',
      contentSha256: 'a'.repeat(64),
      sourceHtml: null,
    },
    {
      configId: cfg!.id,
      versionNumber: 2,
      source: 'echo already',
      interpreter: 'bash',
      contentSha256: 'b'.repeat(64),
      sourceHtml: '<pre>KEEP</pre>',
    },
  ])
})
afterAll(async () => {
  await client.close()
})

it('highlights only the null rows and leaves populated rows untouched', async () => {
  const res = await backfillSourceHtml(db)
  expect(res.updated).toBe(1)
  const rows = await db.select().from(schema.configVersions)
  const v1 = rows.find((r) => r.versionNumber === 1)
  const v2 = rows.find((r) => r.versionNumber === 2)
  expect(v1?.sourceHtml).toContain('class="shiki')
  expect(v2?.sourceHtml).toBe('<pre>KEEP</pre>')
})

it('is idempotent — a second run updates nothing', async () => {
  const res = await backfillSourceHtml(db)
  expect(res.updated).toBe(0)
})
