import { PGlite } from '@electric-sql/pglite'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { getConfigBySlug } from '@/gallery/queries'
import { storePreviews } from '@/render/store'
import { toggleVote } from '@/votes/vote'

let client: PGlite
let db: ReturnType<typeof drizzle<typeof schema>>
beforeAll(async () => {
  client = new PGlite()
  db = drizzle({ client, schema })
  await migrate(db, { migrationsFolder: './drizzle' })
  // Seed users required by the votes FK (user_id → user.id) and the
  // configs author FK (author_id → user.id, the 'u1' author below).
  await db
    .insert(schema.user)
    .values([
      {
        id: 'u1',
        name: 'Author One',
        username: 'authorone',
        email: 'author1@test.com',
        image: 'https://example.com/avatar.png',
        emailVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'user-voted',
        name: 'User Voted',
        email: 'uservoted@test.com',
        emailVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'user-who-voted',
        name: 'User Who Voted',
        email: 'userwhovoted@test.com',
        emailVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ])
    .onConflictDoNothing()
})
afterAll(async () => {
  await client.close()
})

const SHA = 'c'.repeat(64)
const SOURCE = '#!/usr/bin/env bash\necho detail'

async function seed(status: string, slug = 'detail-one', sha = SHA, tags: string[] = []) {
  // Insert the config first so the version's config_id FK is satisfiable, then
  // back-patch the config's current_version_id (which has no FK constraint).
  const cfgRows = await db
    .insert(schema.configs)
    .values({
      slug,
      title: 'Detail One',
      description: 'd',
      authorId: 'u1',
      interpreter: 'bash',
      status,
      tags,
    })
    .returning()
  const cfg = cfgRows[0]!
  const verRows = await db
    .insert(schema.configVersions)
    .values({
      configId: cfg.id,
      versionNumber: 1,
      source: SOURCE,
      interpreter: 'bash',
      contentSha256: sha,
      status: 'approved',
    })
    .returning()
  const ver = verRows[0]!
  await db
    .update(schema.configs)
    .set({ currentVersionId: ver.id })
    .where(eq(schema.configs.id, cfg.id))
  await storePreviews(db, sha, [
    {
      scenarioKey: 'clean-main',
      segments: [
        { text: 'clean', fg: null, bg: null, bold: false, italic: false, underline: false },
      ],
      rawStdout: 'clean',
      exitCode: 0,
      timedOut: false,
      trace: { networkAttempts: [], sensitiveReads: [], spawnedProcesses: [] },
    },
    {
      scenarioKey: 'costly-full',
      segments: [
        { text: 'costly', fg: null, bg: null, bold: false, italic: false, underline: false },
      ],
      rawStdout: 'costly',
      exitCode: 0,
      timedOut: false,
      trace: { networkAttempts: [], sensitiveReads: [], spawnedProcesses: [] },
    },
  ])
  return cfg
}

describe('getConfigBySlug', () => {
  it('returns the published config with source, hash, and all previews', async () => {
    await seed('published')
    const detail = await getConfigBySlug(db, 'detail-one')
    expect(detail).not.toBeNull()
    expect(detail?.source).toBe(SOURCE)
    expect(detail?.contentSha256).toBe(SHA)
    expect(detail?.previews.map((p) => p.scenarioKey).sort()).toEqual(['clean-main', 'costly-full'])
  })
  it('returns null for a non-published slug', async () => {
    const detail = await getConfigBySlug(db, 'does-not-exist')
    expect(detail).toBeNull()
  })
  it('returns null for a draft config (published-only filter)', async () => {
    // Seeded WITH a version, so the only reason it's excluded is the status filter.
    await seed('draft', 'detail-draft', 'd'.repeat(64))
    const detail = await getConfigBySlug(db, 'detail-draft')
    expect(detail).toBeNull()
  })

  it('returns upvoteCount on ConfigDetail', async () => {
    const cfg = await seed('published', 'detail-counts', 'e'.repeat(64))
    // Cast upvoteCount to 4 directly.
    await db.update(schema.configs).set({ upvoteCount: 4 }).where(eq(schema.configs.id, cfg.id))

    const detail = await getConfigBySlug(db, 'detail-counts')
    expect(detail).not.toBeNull()
    expect(detail?.upvoteCount).toBe(4)
  })

  it('returns author and copyCount on ConfigDetail', async () => {
    const cfg = await seed('published', 'detail-author', '11'.repeat(32))
    await db.update(schema.configs).set({ copyCount: 6 }).where(eq(schema.configs.id, cfg.id))

    const detail = await getConfigBySlug(db, 'detail-author')
    expect(detail).not.toBeNull()
    expect(detail?.copyCount).toBe(6)
    expect(detail?.author).toEqual({
      name: 'Author One',
      username: 'authorone',
      image: 'https://example.com/avatar.png',
    })
  })

  it('hasVoted is false when no userId is provided', async () => {
    await seed('published', 'detail-hasvoted-no-user', 'f'.repeat(64))
    const detail = await getConfigBySlug(db, 'detail-hasvoted-no-user')
    expect(detail?.hasVoted).toBe(false)
  })

  it('hasVoted is false for a userId that has not voted', async () => {
    await seed('published', 'detail-novote', '0'.repeat(64))
    const detail = await getConfigBySlug(db, 'detail-novote', 'user-no-vote')
    expect(detail?.hasVoted).toBe(false)
  })

  it('hasVoted is true for a userId that has voted', async () => {
    const cfg = await seed('published', 'detail-voted', 'a1'.repeat(32))
    await toggleVote(db, 'user-voted', cfg.id)

    const detail = await getConfigBySlug(db, 'detail-voted', 'user-voted')
    expect(detail?.hasVoted).toBe(true)
  })

  it('hasVoted is false for a different userId that has not voted', async () => {
    const cfg = await seed('published', 'detail-voted-other', 'b2'.repeat(32))
    await toggleVote(db, 'user-who-voted', cfg.id)

    // A different user should see hasVoted = false.
    const detail = await getConfigBySlug(db, 'detail-voted-other', 'user-who-did-not-vote')
    expect(detail?.hasVoted).toBe(false)
  })

  it('returns the stored sourceHtml when the version has it', async () => {
    const cfg = await seed('published', 'detail-html', 'abcd'.repeat(16))
    await db
      .update(schema.configVersions)
      .set({ sourceHtml: '<pre>STORED</pre>' })
      .where(eq(schema.configVersions.configId, cfg.id))
    const detail = await getConfigBySlug(db, 'detail-html')
    expect(detail?.sourceHtml).toBe('<pre>STORED</pre>')
  })

  it('sourceHtml is null when the version has none (fallback path)', async () => {
    await seed('published', 'detail-nohtml', 'ef01'.repeat(16))
    const detail = await getConfigBySlug(db, 'detail-nohtml')
    expect(detail?.sourceHtml).toBeNull()
  })

  it('returns networkHosts for a published network config', async () => {
    const cfg = await seed('published', 'detail-network', '1234'.repeat(16))
    await db
      .update(schema.configVersions)
      .set({ networkHosts: ['wttr.in'] })
      .where(eq(schema.configVersions.configId, cfg.id))

    const detail = await getConfigBySlug(db, 'detail-network')
    expect(detail?.networkHosts).toEqual(['wttr.in'])
  })

  it('returns empty networkHosts when version has none', async () => {
    await seed('published', 'detail-nonetwork', 'abab'.repeat(16))
    const detail = await getConfigBySlug(db, 'detail-nonetwork')
    expect(detail?.networkHosts).toEqual([])
  })

  it('returns the stored license and sourceUrl when the version has them', async () => {
    const cfg = await seed('published', 'detail-licensed', 'aabb'.repeat(16))
    await db
      .update(schema.configVersions)
      .set({ license: 'MIT', sourceUrl: 'https://example.com/x' })
      .where(eq(schema.configVersions.configId, cfg.id))

    const detail = await getConfigBySlug(db, 'detail-licensed')
    expect(detail?.license).toBe('MIT')
    expect(detail?.sourceUrl).toBe('https://example.com/x')
  })

  it('license and sourceUrl are null when the version has neither', async () => {
    await seed('published', 'detail-unlicensed', 'ccdd'.repeat(16))
    const detail = await getConfigBySlug(db, 'detail-unlicensed')
    expect(detail?.license).toBeNull()
    expect(detail?.sourceUrl).toBeNull()
  })

  it('returns the config tags', async () => {
    await seed('published', 'tagged-config', 'ddee'.repeat(16), ['git'])
    const detail = await getConfigBySlug(db, 'tagged-config')
    expect(detail?.tags).toEqual(['git'])
  })

  it('updatedAt is the version reviewedAt as a YYYY-MM-DD date', async () => {
    const cfg = await seed('published', 'detail-updated', '2222'.repeat(16))
    await db
      .update(schema.configVersions)
      .set({ reviewedAt: new Date('2026-07-06T12:00:00Z') })
      .where(eq(schema.configVersions.configId, cfg.id))
    const detail = await getConfigBySlug(db, 'detail-updated')
    expect(detail?.updatedAt).toBe('2026-07-06')
  })

  it('updatedAt falls back to the config createdAt date when reviewedAt is null', async () => {
    await seed('published', 'detail-noreview', '3333'.repeat(16))
    const detail = await getConfigBySlug(db, 'detail-noreview')
    expect(detail?.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
