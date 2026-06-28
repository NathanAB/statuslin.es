import { PGlite } from '@electric-sql/pglite'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import {
  GLOBAL_RENDER_QUEUE_MAX,
  HELD_RENDER_JOBS_MAX,
  SUBMISSION_RATE_LIMIT,
  submitConfig,
} from '@/submit/submit'

async function seedConfigs(
  db: ReturnType<typeof drizzle<typeof schema>>,
  authorId: string,
  count: number,
  createdAt: Date,
) {
  for (let i = 0; i < count; i++) {
    await db.insert(schema.configs).values({
      slug: `seed-${authorId}-${i}-${Date.now()}-${Math.random()}`,
      title: `Seeded Config ${i}`,
      description: 'seeded',
      authorId,
      interpreter: 'bash',
      status: 'draft',
      createdAt,
    })
  }
}

// Seeds `count` render_jobs of the given status, all attached to one fresh config_version
// (render_jobs has no uniqueness on config_version_id). Used to fill the global render queue.
async function seedRenderJobs(
  db: ReturnType<typeof drizzle<typeof schema>>,
  authorId: string,
  count: number,
  status: string,
) {
  const cfgRows = await db
    .insert(schema.configs)
    .values({
      slug: `queue-seed-${authorId}-${Date.now()}-${Math.random()}`,
      title: 'Queue Seed Config',
      description: 'seeded',
      authorId,
      interpreter: 'bash',
      status: 'draft',
    })
    .returning()
  const cfg = cfgRows[0]
  if (!cfg) throw new Error('seedRenderJobs: insert configs returned no row')
  const verRows = await db
    .insert(schema.configVersions)
    .values({
      configId: cfg.id,
      versionNumber: 1,
      source: '#!/bin/bash\necho seed',
      interpreter: 'bash',
      contentSha256: 'seed',
      status: 'pending',
    })
    .returning()
  const ver = verRows[0]
  if (!ver) throw new Error('seedRenderJobs: insert configVersions returned no row')
  for (let i = 0; i < count; i++) {
    await db.insert(schema.renderJobs).values({ configVersionId: ver.id, status })
  }
}

let client: PGlite
let db: ReturnType<typeof drizzle<typeof schema>>
beforeAll(async () => {
  client = new PGlite()
  db = drizzle({ client, schema })
  await migrate(db, { migrationsFolder: './drizzle' })
  // Seed the authors referenced by the configs FK (author_id → user.id)
  await db
    .insert(schema.user)
    .values(
      [
        'u1',
        'rate-user',
        'rate-user-full',
        'rate-user-other',
        'rate-user-old',
        'queue-seed-user',
        'queue-user',
      ].map((id) => ({
        id,
        name: id,
        email: `${id}@test.com`,
        emailVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
    )
    .onConflictDoNothing()
})
afterAll(async () => {
  await client.close()
})

const input = {
  authorId: 'u1',
  title: 'My Line',
  description: 'hi',
  interpreter: 'bash' as const,
  source: '#!/bin/bash\necho hi',
}

describe('submitConfig', () => {
  // Start each test from an empty configs table so the per-author rate limit can't leak across
  // tests (the default author 'u1' is shared). Deleting a config cascades to its versions, render
  // jobs, votes, and copies.
  beforeEach(async () => {
    await db.delete(schema.configs)
  })

  it('creates a draft config, a pending v1, and a queued render job', async () => {
    const res = await submitConfig(db, input)
    const cfgRows = await db
      .select()
      .from(schema.configs)
      .where(eq(schema.configs.id, res.configId))
    const cfg = cfgRows[0]
    expect(cfg?.status).toBe('draft')
    expect(cfg?.slug).toContain('my-line')
    const verRows = await db
      .select()
      .from(schema.configVersions)
      .where(eq(schema.configVersions.id, res.versionId))
    const ver = verRows[0]
    expect(ver?.versionNumber).toBe(1)
    expect(ver?.status).toBe('pending')
    expect(ver?.contentSha256).toHaveLength(64)
    const jobs = await db
      .select()
      .from(schema.renderJobs)
      .where(eq(schema.renderJobs.configVersionId, res.versionId))
    expect(jobs[0]?.status).toBe('queued')
  })

  it('stores the highlighted source_html on the version so the detail page skips re-highlighting', async () => {
    const res = await submitConfig(db, input)
    const verRows = await db
      .select()
      .from(schema.configVersions)
      .where(eq(schema.configVersions.id, res.versionId))
    const ver = verRows[0]
    // Shiki wraps the code in <pre class="shiki ...">, with the source text escaped inside.
    expect(ver?.sourceHtml).toContain('<pre')
    expect(ver?.sourceHtml).toContain('echo')
  })
  it('rejects an obfuscated source and creates no config row', async () => {
    // 240-char unbroken base64 run triggers the blob heuristic
    const obfuscatedSource = `#!/bin/bash\necho "${'A'.repeat(240)}"`
    await expect(
      submitConfig(db, { ...input, title: 'Obfuscated Submission', source: obfuscatedSource }),
    ).rejects.toThrow('Submission rejected (looks obfuscated)')
    await expect(
      submitConfig(db, { ...input, title: 'Obfuscated Submission 2', source: obfuscatedSource }),
    ).rejects.toMatchObject({ status: 400 })
    // Confirm no config row was inserted for this title
    const rows = await db
      .select()
      .from(schema.configs)
      .where(eq(schema.configs.title, 'Obfuscated Submission'))
    expect(rows).toHaveLength(0)
  })

  it('gives each submission a unique slug', async () => {
    const a = await submitConfig(db, input)
    const b = await submitConfig(db, input)
    const caRows = await db.select().from(schema.configs).where(eq(schema.configs.id, a.configId))
    const cbRows = await db.select().from(schema.configs).where(eq(schema.configs.id, b.configId))
    const ca = caRows[0]
    const cb = cbRows[0]
    expect(ca?.slug).not.toBe(cb?.slug)
  })

  describe('rate limiting', () => {
    it('allows submissions up to the limit, then rejects the next within an hour', async () => {
      const authorId = 'rate-user'
      const withinHour = new Date(Date.now() - 30 * 60 * 1000) // 30 min ago
      // Seed one short of the limit; the next submission lands exactly at the limit and is allowed.
      await seedConfigs(db, authorId, SUBMISSION_RATE_LIMIT - 1, withinHour)
      const atLimit = await submitConfig(db, {
        authorId,
        title: 'Submission At Limit',
        description: 'should succeed (lands on the limit)',
        interpreter: 'bash',
        source: '#!/bin/bash\necho ok',
      })
      expect(atLimit.configId).toBeDefined()
      // Now the author is at the limit; the next one is rejected.
      await expect(
        submitConfig(db, {
          authorId,
          title: 'Rate Limited Submission',
          description: 'should be rejected',
          interpreter: 'bash',
          source: '#!/bin/bash\necho rate',
        }),
      ).rejects.toThrow('Rate limit: too many submissions, try again later')
      await expect(
        submitConfig(db, {
          authorId,
          title: 'Rate Limited Submission 2',
          description: 'should be rejected',
          interpreter: 'bash',
          source: '#!/bin/bash\necho rate',
        }),
      ).rejects.toMatchObject({ status: 429 })
    })

    it('does not rate-limit a different author when one author is at the limit', async () => {
      const limitedAuthor = 'rate-user-full'
      const otherAuthor = 'rate-user-other'
      const withinHour = new Date(Date.now() - 30 * 60 * 1000)
      await seedConfigs(db, limitedAuthor, SUBMISSION_RATE_LIMIT, withinHour)
      // The other author has no configs — should succeed
      const result = await submitConfig(db, {
        authorId: otherAuthor,
        title: 'Other Author Submission',
        description: 'should succeed',
        interpreter: 'bash',
        source: '#!/bin/bash\necho other',
      })
      expect(result.configId).toBeDefined()
    })

    it('does not count configs created more than an hour ago toward the rate limit', async () => {
      const authorId = 'rate-user-old'
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000)
      await seedConfigs(db, authorId, SUBMISSION_RATE_LIMIT, twoHoursAgo)
      // All are outside the window — should succeed
      const result = await submitConfig(db, {
        authorId,
        title: 'Old Configs Submission',
        description: 'should succeed because old configs do not count',
        interpreter: 'bash',
        source: '#!/bin/bash\necho old',
      })
      expect(result.configId).toBeDefined()
    })
  })

  describe('global render queue cap', () => {
    // The cap is global, so unlike the per-author tests, distinct authors don't isolate these.
    // Clear all render_jobs before each case so prior tests' queued jobs don't skew the count.
    beforeEach(async () => {
      await db.delete(schema.renderJobs)
    })

    it('rejects a submission when the global render queue is at the cap', async () => {
      // Fill the queue to the cap with queued jobs from a different author than the
      // submitter, so the per-author limit can't be what rejects this — only the global cap.
      await seedRenderJobs(db, 'queue-seed-user', GLOBAL_RENDER_QUEUE_MAX, 'queued')
      await expect(
        submitConfig(db, {
          authorId: 'queue-user',
          title: 'Over Global Queue Cap',
          description: 'should be rejected by the global cap',
          interpreter: 'bash',
          source: '#!/bin/bash\necho queue',
        }),
      ).rejects.toMatchObject({ status: 429 })
      // No config row should have been inserted for the rejected submission.
      const rows = await db
        .select()
        .from(schema.configs)
        .where(eq(schema.configs.title, 'Over Global Queue Cap'))
      expect(rows).toHaveLength(0)
    })

    it('allows a submission when the global render queue is below the cap', async () => {
      // One under the cap of queued+running work — should still succeed.
      await seedRenderJobs(db, 'queue-seed-user', GLOBAL_RENDER_QUEUE_MAX - 2, 'queued')
      await seedRenderJobs(db, 'queue-seed-user', 1, 'running')
      const result = await submitConfig(db, {
        authorId: 'queue-user',
        title: 'Under Global Queue Cap',
        description: 'should succeed because the queue is below the cap',
        interpreter: 'bash',
        source: '#!/bin/bash\necho under',
      })
      expect(result.configId).toBeDefined()
    })

    it('does not count done or failed jobs toward the global queue cap', async () => {
      // A pile of terminal jobs must not block new submissions.
      await seedRenderJobs(db, 'queue-seed-user', GLOBAL_RENDER_QUEUE_MAX, 'done')
      await seedRenderJobs(db, 'queue-seed-user', GLOBAL_RENDER_QUEUE_MAX, 'failed')
      const result = await submitConfig(db, {
        authorId: 'queue-user',
        title: 'Terminal Jobs Do Not Count',
        description: 'should succeed because done/failed jobs are not pending',
        interpreter: 'bash',
        source: '#!/bin/bash\necho terminal',
      })
      expect(result.configId).toBeDefined()
    })
  })

  describe('submitConfig network submissions', () => {
    beforeEach(async () => {
      await db.delete(schema.renderJobs)
      await db.delete(schema.configs)
    })

    it('stores networkHosts and creates a held render job', async () => {
      const { versionId } = await submitConfig(db, {
        authorId: 'u1',
        title: 'Weather',
        description: '',
        interpreter: 'bash',
        source: '#!/bin/bash\ncurl -s wttr.in',
        networkHosts: ['wttr.in'],
      })
      const [ver] = await db
        .select()
        .from(schema.configVersions)
        .where(eq(schema.configVersions.id, versionId))
      expect(ver?.networkHosts).toEqual(['wttr.in'])
      const [job] = await db
        .select()
        .from(schema.renderJobs)
        .where(eq(schema.renderJobs.configVersionId, versionId))
      expect(job?.status).toBe('held')
    })

    it('creates a queued job and empty hosts for a non-network submission', async () => {
      const { versionId } = await submitConfig(db, {
        authorId: 'u1',
        title: 'Plain',
        description: '',
        interpreter: 'bash',
        source: '#!/bin/bash\necho hi',
        networkHosts: [],
      })
      const [ver] = await db
        .select()
        .from(schema.configVersions)
        .where(eq(schema.configVersions.id, versionId))
      expect(ver?.networkHosts).toEqual([])
      const [job] = await db
        .select()
        .from(schema.renderJobs)
        .where(eq(schema.renderJobs.configVersionId, versionId))
      expect(job?.status).toBe('queued')
    })

    it('rejects a network submission when the held-job cap is reached', async () => {
      await seedRenderJobs(db, 'u1', HELD_RENDER_JOBS_MAX, 'held')
      await expect(
        submitConfig(db, {
          authorId: 'u1',
          title: 'Over cap',
          description: '',
          interpreter: 'bash',
          source: '#!/bin/bash\ncurl -s wttr.in',
          networkHosts: ['wttr.in'],
        }),
      ).rejects.toThrow(/held|queue/i)
    })
  })
})
