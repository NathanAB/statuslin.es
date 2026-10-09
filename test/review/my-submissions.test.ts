import { PGlite } from '@electric-sql/pglite'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { FakeSandboxRunner } from '@/render/fake-runner'
import { approveVersion } from '@/review/decide'
import { getMySubmissionRows } from '@/review/my-submissions'
import { submitConfig } from '@/submit/submit'
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
    emailVerified: false,
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

const live = {
  authorId: 'owner',
  title: 'Live line',
  description: 'Live description',
  interpreter: 'bash' as const,
  source: 'echo live',
}

async function publish() {
  const result = await submitConfig(db, live)
  await processNextRenderJob(db, new FakeSandboxRunner())
  await approveVersion(db, result.versionId, 'admin')
  return result
}

const rowFor = async (configId: string) =>
  (await getMySubmissionRows(db, 'owner')).find((row) => row.config.id === configId)

describe('getMySubmissionRows with updates', () => {
  it('shows the live version and summarizes a pending update', async () => {
    const v1 = await publish()
    const v2 = await submitConfig(
      db,
      { ...live, title: 'Updated line', source: 'echo updated' },
      { updateSlug: v1.slug },
    )

    const row = await rowFor(v1.configId)
    expect(row?.config.status).toBe('published')
    expect(row?.version).toMatchObject({ id: v1.versionId, title: live.title, status: 'approved' })
    expect(row?.renderJob.status).toBe('done')
    expect(row?.update).toEqual({
      versionNumber: 2,
      status: 'pending',
      renderStatus: 'queued',
      rejectionReason: null,
    })

    for (const renderStatus of ['running', 'failed', 'done', 'held']) {
      await db
        .update(schema.renderJobs)
        .set({ status: renderStatus })
        .where(eq(schema.renderJobs.configVersionId, v2.versionId))
      expect((await rowFor(v1.configId))?.update?.renderStatus).toBe(renderStatus)
    }
  })

  it('shows the live version when it has no render job row (legacy or seeded data)', async () => {
    const v1 = await publish()
    await submitConfig(
      db,
      { ...live, title: 'Updated line', source: 'echo updated' },
      { updateSlug: v1.slug },
    )
    await db.delete(schema.renderJobs).where(eq(schema.renderJobs.configVersionId, v1.versionId))

    const row = await rowFor(v1.configId)
    expect(row?.version).toMatchObject({ id: v1.versionId, title: live.title, status: 'approved' })
    expect(row?.renderJob.status).toBe('done')
    expect(row?.update).toEqual({
      versionNumber: 2,
      status: 'pending',
      renderStatus: 'queued',
      rejectionReason: null,
    })
  })

  it('has no update summary for a published config without one or for a draft', async () => {
    const published = await publish()
    const draft = await submitConfig(db, { ...live, title: 'Draft line' })

    expect((await rowFor(published.configId))?.update).toBeNull()
    const draftRow = await rowFor(draft.configId)
    expect(draftRow?.version.id).toBe(draft.versionId)
    expect(draftRow?.update).toBeNull()
  })
})
