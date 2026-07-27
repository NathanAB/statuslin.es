import { PGlite } from '@electric-sql/pglite'
import { asc, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { getResubmissionDraft, submitConfig } from '@/submit/submit'

let client: PGlite
let db: ReturnType<typeof drizzle<typeof schema>>

beforeAll(async () => {
  client = new PGlite()
  db = drizzle({ client, schema })
  await migrate(db, { migrationsFolder: './drizzle' })
  await db.insert(schema.user).values(
    ['owner', 'other'].map((id) => ({
      id,
      name: id,
      email: `${id}@test.com`,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
  )
})

afterAll(async () => {
  await client.close()
})

beforeEach(async () => {
  await db.delete(schema.configs)
})

const original = {
  authorId: 'owner',
  title: 'Original line',
  description: 'Original description',
  interpreter: 'bash' as const,
  source: 'echo original',
  networkHosts: ['wttr.in'],
}

async function rejectedSubmission() {
  const result = await submitConfig(db, original)
  await db
    .update(schema.configVersions)
    .set({
      status: 'rejected',
      rejectionReason: 'Remove the updater.',
      rejectionEmailStatus: 'sent',
    })
    .where(eq(schema.configVersions.id, result.versionId))
  return result
}

describe('getResubmissionDraft', () => {
  it('returns the owner’s latest rejected version as an editable draft', async () => {
    const rejected = await rejectedSubmission()

    await expect(getResubmissionDraft(db, rejected.slug, 'owner')).resolves.toEqual({
      versionId: rejected.versionId,
      slug: rejected.slug,
      title: original.title,
      description: original.description,
      interpreter: original.interpreter,
      source: original.source,
      networkHosts: original.networkHosts,
    })
  })

  it('rejects a lookup by another user', async () => {
    const rejected = await rejectedSubmission()
    await expect(getResubmissionDraft(db, rejected.slug, 'other')).rejects.toMatchObject({
      status: 404,
    })
  })
})

describe('linked resubmission', () => {
  it('creates pending v2 on the same config and keeps rejected v1 immutable', async () => {
    const rejected = await rejectedSubmission()
    const corrected = {
      ...original,
      title: 'Corrected line',
      description: 'Corrected description',
      source: 'echo corrected',
      networkHosts: [],
    }

    const result = await submitConfig(db, corrected, {
      rejectedVersionId: rejected.versionId,
    })

    expect(result).toMatchObject({ configId: rejected.configId, slug: rejected.slug })
    const versions = await db
      .select()
      .from(schema.configVersions)
      .where(eq(schema.configVersions.configId, rejected.configId))
      .orderBy(asc(schema.configVersions.versionNumber))
    expect(versions).toHaveLength(2)
    expect(versions[0]).toMatchObject({
      id: rejected.versionId,
      versionNumber: 1,
      source: original.source,
      status: 'rejected',
    })
    expect(versions[1]).toMatchObject({
      id: result.versionId,
      versionNumber: 2,
      source: corrected.source,
      status: 'pending',
    })
    const [config] = await db
      .select()
      .from(schema.configs)
      .where(eq(schema.configs.id, rejected.configId))
    expect(config).toMatchObject({
      title: corrected.title,
      description: corrected.description,
      interpreter: corrected.interpreter,
    })
    const [job] = await db
      .select()
      .from(schema.renderJobs)
      .where(eq(schema.renderJobs.configVersionId, result.versionId))
    expect(job?.status).toBe('queued')
  })

  it('rejects another owner and a target that is no longer latest', async () => {
    const rejected = await rejectedSubmission()
    await expect(
      submitConfig(
        db,
        { ...original, authorId: 'other' },
        { rejectedVersionId: rejected.versionId },
      ),
    ).rejects.toMatchObject({ status: 403 })

    const [v2] = await db
      .insert(schema.configVersions)
      .values({
        configId: rejected.configId,
        versionNumber: 2,
        source: 'echo newer',
        interpreter: 'bash',
        contentSha256: 'newer',
        status: 'pending',
      })
      .returning()
    await db.insert(schema.renderJobs).values({ configVersionId: v2!.id })
    await expect(
      submitConfig(db, original, { rejectedVersionId: rejected.versionId }),
    ).rejects.toMatchObject({ status: 409 })
  })

  it('rejects a published config even if its latest version is marked rejected', async () => {
    const rejected = await rejectedSubmission()
    await db
      .update(schema.configs)
      .set({ status: 'published', currentVersionId: rejected.versionId })
      .where(eq(schema.configs.id, rejected.configId))

    await expect(getResubmissionDraft(db, rejected.slug, 'owner')).rejects.toMatchObject({
      status: 409,
    })
    await expect(
      submitConfig(db, original, { rejectedVersionId: rejected.versionId }),
    ).rejects.toMatchObject({ status: 409 })
  })

  it('counts submissions and resubmissions together for the hourly rate limit', async () => {
    const rejected = await rejectedSubmission()
    const v2 = await submitConfig(
      db,
      { ...original, source: 'echo v2' },
      {
        rejectedVersionId: rejected.versionId,
      },
    )
    await db
      .update(schema.configVersions)
      .set({ status: 'rejected' })
      .where(eq(schema.configVersions.id, v2.versionId))
    const v3 = await submitConfig(
      db,
      { ...original, source: 'echo v3' },
      {
        rejectedVersionId: v2.versionId,
      },
    )
    await db
      .update(schema.configVersions)
      .set({ status: 'rejected' })
      .where(eq(schema.configVersions.id, v3.versionId))

    await expect(
      submitConfig(db, original, { rejectedVersionId: v3.versionId }),
    ).rejects.toMatchObject({ status: 429 })
  })

  it('allows only one of two concurrent attempts to create v2', async () => {
    const rejected = await rejectedSubmission()

    const attempts = await Promise.allSettled([
      submitConfig(
        db,
        { ...original, source: 'echo first' },
        {
          rejectedVersionId: rejected.versionId,
        },
      ),
      submitConfig(
        db,
        { ...original, source: 'echo second' },
        {
          rejectedVersionId: rejected.versionId,
        },
      ),
    ])

    expect(attempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(1)
    expect(attempts.filter((attempt) => attempt.status === 'rejected')).toHaveLength(1)
    const versions = await db
      .select()
      .from(schema.configVersions)
      .where(eq(schema.configVersions.configId, rejected.configId))
    expect(versions).toHaveLength(2)
  })
})
