import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { FakeSandboxRunner } from '@/render/fake-runner'
import { approveVersion, runNetworkPreview } from '@/review/decide'
import { getDashboardRows } from '@/review/queue'
import { type SubmitInput, submitConfig } from '@/submit/submit'
import { processNextRenderJob } from '@/submit/worker'

let client: PGlite
let db: ReturnType<typeof drizzle<typeof schema>>

beforeAll(async () => {
  client = new PGlite()
  db = drizzle({ client, schema })
  await migrate(db, { migrationsFolder: './drizzle' })
  await db.insert(schema.user).values({
    id: 'owner',
    name: 'owner',
    email: 'owner@test.com',
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  })
})

afterAll(async () => {
  await client.close()
})

beforeEach(async () => {
  await db.delete(schema.configs)
})

const live: SubmitInput = {
  authorId: 'owner',
  title: 'Live line',
  description: 'Live description',
  interpreter: 'bash',
  source: 'echo live',
  networkHosts: ['api.example.com'],
}

async function publish() {
  const result = await submitConfig(db, live)
  await runNetworkPreview(db, result.versionId)
  await processNextRenderJob(db, new FakeSandboxRunner())
  await approveVersion(db, result.versionId, 'admin')
  return result
}

const rowFor = async (versionId: string) =>
  (await getDashboardRows(db)).find((row) => row.version.id === versionId)

describe('admin queue rows for an update', () => {
  it("carry the live version's script, title, description, interpreter and network hosts", async () => {
    const v1 = await publish()
    const v2 = await submitConfig(
      db,
      {
        ...live,
        title: 'Updated line',
        source: 'echo updated',
        networkHosts: ['api.example.com', 'new.example.com'],
      },
      { updateSlug: v1.slug },
    )

    const row = await rowFor(v2.versionId)

    expect(row?.version.title).toBe('Updated line')
    expect(row?.live).toEqual({
      title: 'Live line',
      description: 'Live description',
      interpreter: 'bash',
      source: 'echo live',
      networkHosts: ['api.example.com'],
    })
  })

  it('carry no live version for a first submission', async () => {
    const first = await submitConfig(db, { ...live, networkHosts: [] })

    const row = await rowFor(first.versionId)

    expect(row).toBeDefined()
    expect(row?.live).toBeUndefined()
  })
})
