import type { PGlite } from '@electric-sql/pglite'
import { eq, inArray } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { getConfigBySlug } from '@/gallery/queries'
import { storePreviews } from '@/render/store'
import { insertSubmission } from '../fixtures/submission'
import { migratedPGlite } from '../helpers/test-db'

let client: PGlite
let db: ReturnType<typeof drizzle<typeof schema>>
beforeAll(async () => {
  client = await migratedPGlite()
  db = drizzle({ client, schema })
  // Seed the user required by the configs author FK.
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

const SHA = 'c'.repeat(64)
const SOURCE = '#!/usr/bin/env bash\necho detail'

async function seed(status: string, slug = 'detail-one', sha = SHA, tags: string[] = []) {
  // Insert the config first so the version's config_id FK is satisfiable, then
  // back-patch the config's current_version_id (which has no FK constraint).
  const cfgRows = await db
    .insert(schema.configs)
    .values({
      slug,
      authorId: 'u1',
      status,
      tags,
      allTags: tags,
    })
    .returning()
  const cfg = cfgRows[0]!
  const verRows = await db
    .insert(schema.configVersions)
    .values({
      configId: cfg.id,
      versionNumber: 1,
      title: 'Detail One',
      description: 'd',
      source: SOURCE,
      interpreter: 'bash',
      contentSha256: sha,
    })
    .returning()
  const ver = verRows[0]!
  await insertSubmission(db, ver.id, 'u1', { status: 'approved' })
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
  it('returns source, hash, and every preview with only the scenario and compact segments', async () => {
    await seed('published')
    const detail = await getConfigBySlug(db, 'detail-one')
    expect(detail?.source).toBe(SOURCE)
    expect(detail?.contentSha256).toBe(SHA)
    const byKey = [...(detail?.previews ?? [])].sort((a, b) =>
      a.scenarioKey.localeCompare(b.scenarioKey),
    )
    expect(byKey).toEqual([
      { scenarioKey: 'clean-main', segments: [{ text: 'clean' }] },
      { scenarioKey: 'costly-full', segments: [{ text: 'costly' }] },
    ])
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

  it('returns author and copyCount without public vote state on ConfigDetail', async () => {
    const cfg = await seed('published', 'detail-counts', 'e'.repeat(64))
    await db
      .update(schema.configs)
      .set({ upvoteCount: 4, copyCount: 6 })
      .where(eq(schema.configs.id, cfg.id))

    const detail = await getConfigBySlug(db, 'detail-counts')
    expect(detail?.copyCount).toBe(6)
    expect(detail).not.toHaveProperty('upvoteCount')
    expect(detail).not.toHaveProperty('hasVoted')
    expect(detail?.author).toEqual({
      name: 'Author One',
      username: 'authorone',
      image: 'https://example.com/avatar.png',
    })
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

  it('falls back to null sourceHtml, license and sourceUrl, and no networkHosts, for a bare version', async () => {
    await seed('published', 'detail-bare', 'ef01'.repeat(16))
    const detail = await getConfigBySlug(db, 'detail-bare')
    expect(detail).toMatchObject({
      sourceHtml: null,
      networkHosts: [],
      license: null,
      sourceUrl: null,
    })
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

  it('returns the config tags', async () => {
    await seed('published', 'tagged-config', 'ddee'.repeat(16), ['git'])
    const detail = await getConfigBySlug(db, 'tagged-config')
    expect(detail?.tags).toEqual(['git'])
  })

  it('updatedAt is the version reviewedAt as a YYYY-MM-DD date', async () => {
    const cfg = await seed('published', 'detail-updated', '2222'.repeat(16))
    await db
      .update(schema.submissions)
      .set({ reviewedAt: new Date('2026-07-06T12:00:00Z') })
      .where(
        inArray(
          schema.submissions.configVersionId,
          db
            .select({ id: schema.configVersions.id })
            .from(schema.configVersions)
            .where(eq(schema.configVersions.configId, cfg.id)),
        ),
      )
    const detail = await getConfigBySlug(db, 'detail-updated')
    expect(detail?.updatedAt).toBe('2026-07-06')
  })

  it('updatedAt falls back to the config createdAt date when reviewedAt is null', async () => {
    const cfg = await seed('published', 'detail-noreview', '3333'.repeat(16))
    await db
      .update(schema.configs)
      .set({ createdAt: new Date('2026-03-04T08:00:00Z') })
      .where(eq(schema.configs.id, cfg.id))
    const detail = await getConfigBySlug(db, 'detail-noreview')
    expect(detail?.updatedAt).toBe('2026-03-04')
  })
})
