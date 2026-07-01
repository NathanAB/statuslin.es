import { PGlite } from '@electric-sql/pglite'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { getRelatedConfigs, RELATED_LIMIT } from '@/gallery/queries'
import { storePreviews } from '@/render/store'

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
      id: 'u1',
      name: 'Author One',
      username: 'authorone',
      email: 'author1@test.com',
      image: 'https://example.com/avatar.png',
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoNothing()
})
afterAll(async () => {
  await client.close()
})

// Mirrors the seed helper in test/gallery/queries.test.ts: config first (so the
// version's config_id FK is satisfiable), then back-patch current_version_id.
async function seedPublished(opts: {
  slug: string
  title: string
  sha: string
  upvoteCount?: number
}) {
  const cfgRows = await db
    .insert(schema.configs)
    .values({
      slug: opts.slug,
      title: opts.title,
      description: 'desc',
      authorId: 'u1',
      interpreter: 'bash',
      status: 'published',
      upvoteCount: opts.upvoteCount ?? 0,
    })
    .returning()
  const cfg = cfgRows[0]!
  const verRows = await db
    .insert(schema.configVersions)
    .values({
      configId: cfg.id,
      versionNumber: 1,
      source: '#!/usr/bin/env bash\necho hi',
      interpreter: 'bash',
      contentSha256: opts.sha,
      status: 'approved',
    })
    .returning()
  const ver = verRows[0]!
  await db
    .update(schema.configs)
    .set({ currentVersionId: ver.id })
    .where(eq(schema.configs.id, cfg.id))
  await storePreviews(db, opts.sha, [
    {
      scenarioKey: 'clean-main',
      segments: [
        { text: opts.title, fg: null, bg: null, bold: false, italic: false, underline: false },
      ],
      rawStdout: opts.title,
      exitCode: 0,
      timedOut: false,
      trace: { networkAttempts: [], sensitiveReads: [], spawnedProcesses: [] },
    },
  ])
  return cfg
}

describe('getRelatedConfigs', () => {
  it('returns other published configs top-voted first, excluding the viewed slug', async () => {
    await seedPublished({ slug: 'viewed', title: 'Viewed', sha: 'a'.repeat(64), upvoteCount: 99 })
    await seedPublished({ slug: 'popular', title: 'Popular', sha: 'b'.repeat(64), upvoteCount: 5 })
    await seedPublished({ slug: 'quiet', title: 'Quiet', sha: 'c'.repeat(64), upvoteCount: 1 })
    await db.insert(schema.configs).values({
      slug: 'draft-one',
      title: 'Draft',
      description: '',
      authorId: 'u1',
      interpreter: 'bash',
      status: 'draft',
    })

    const related = await getRelatedConfigs(db, 'viewed')
    const slugs = related.map((r) => r.slug)
    expect(slugs).not.toContain('viewed')
    expect(slugs).not.toContain('draft-one')
    expect(slugs.indexOf('popular')).toBeLessThan(slugs.indexOf('quiet'))
    expect(related[0]?.preview?.[0]?.text).toBe('Popular')
  })

  it('caps results at the limit', async () => {
    // 3 published configs exist beyond 'viewed' after this insert
    await seedPublished({ slug: 'third', title: 'Third', sha: 'd'.repeat(64), upvoteCount: 2 })
    const related = await getRelatedConfigs(db, 'viewed', 2)
    expect(related).toHaveLength(2)
    expect(RELATED_LIMIT).toBe(6)
  })
})
