import { PGlite } from '@electric-sql/pglite'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import {
  backfillAllTags,
  listPublishedSlugsMissingTags,
  suggestAndStoreTags,
  suggestTags,
} from '../../scripts/backfill-tags'

let client: PGlite
let db: ReturnType<typeof drizzle<typeof schema>>

async function seed(
  slug: string,
  opts: { status?: string; tags?: string[]; interpreter?: string } = {},
): Promise<void> {
  const interpreter = opts.interpreter ?? 'bash'
  const [config] = await db
    .insert(schema.configs)
    .values({
      slug,
      title: `Config ${slug}`,
      authorId: 'u1',
      interpreter,
      status: opts.status ?? 'published',
      ...(opts.tags ? { tags: opts.tags } : {}),
    })
    .returning()
  if (!config) throw new Error('config seed failed')
  const [version] = await db
    .insert(schema.configVersions)
    .values({
      configId: config.id,
      versionNumber: 1,
      source: 'echo "$(git branch --show-current)"',
      interpreter,
      contentSha256: `sha-${slug}`,
      status: 'approved',
    })
    .returning()
  if (!version) throw new Error('version seed failed')
  await db
    .update(schema.configs)
    .set({ currentVersionId: version.id })
    .where(eq(schema.configs.id, config.id))
}

beforeAll(async () => {
  client = new PGlite()
  db = drizzle({ client, schema })
  await migrate(db, { migrationsFolder: './drizzle' })
  await db.insert(schema.user).values({
    id: 'u1',
    name: 'Author One',
    email: 'author1@test.com',
    emailVerified: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  })
  await seed('untagged', {})
  await seed('tagged', { tags: ['git'] })
  await seed('draft-untagged', { status: 'draft' })
  await seed('stale-all-tags', { tags: ['quota'], interpreter: 'node' })
})

afterAll(async () => {
  await client.close()
})

describe('listPublishedSlugsMissingTags', () => {
  it('lists only published configs with empty tags', async () => {
    expect(await listPublishedSlugsMissingTags(db)).toEqual(['untagged'])
  })
})

describe('suggestTags', () => {
  it('builds a prompt from the source, validates the model output, and does not write', async () => {
    const tags = await suggestTags(db, 'untagged', async () => '["git","nonsense"]')
    expect(tags).toEqual(['git'])
    const [row] = await db
      .select({ tags: schema.configs.tags })
      .from(schema.configs)
      .where(eq(schema.configs.slug, 'untagged'))
    expect(row?.tags).toEqual([])
  })

  it('throws on an unknown slug', async () => {
    await expect(suggestTags(db, 'no-such-slug', async () => '[]')).rejects.toThrow(
      /no config found/i,
    )
  })
})

describe('suggestAndStoreTags', () => {
  it('runs the prompt, validates, stores, and returns the tags', async () => {
    const tags = await suggestAndStoreTags(db, 'untagged', async () => '["git","nonsense"]')
    expect(tags).toEqual(['git'])
    const [row] = await db
      .select({ tags: schema.configs.tags, allTags: schema.configs.allTags })
      .from(schema.configs)
      .where(eq(schema.configs.slug, 'untagged'))
    expect(row?.tags).toEqual(['git'])
    expect(row?.allTags).toEqual(['git', 'bash'])
  })
})

describe('backfillAllTags', () => {
  it('recomputes allTags for every published config from curated tags + version capabilities', async () => {
    const count = await backfillAllTags(db)
    expect(count).toBeGreaterThan(0)
    const [row] = await db
      .select({ allTags: schema.configs.allTags })
      .from(schema.configs)
      .where(eq(schema.configs.slug, 'stale-all-tags'))
    expect(row?.allTags).toEqual(['quota', 'node'])
  })
})
