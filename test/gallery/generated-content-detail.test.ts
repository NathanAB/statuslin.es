import { PGlite } from '@electric-sql/pglite'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { GeneratedContent } from '@/content/types'
import * as schema from '@/db/schema'
import { getConfigBySlug } from '@/gallery/queries'

let client: PGlite
let db: ReturnType<typeof drizzle<typeof schema>>

const CONTENT: GeneratedContent = {
  whatItShows: ['Current git branch', 'Model name'],
  requirements: ['bash', 'git on PATH'],
  behaviorNotes: ['Shows a * suffix when the working tree is dirty'],
}

async function seedConfig(slug: string, generatedContent: GeneratedContent | null): Promise<void> {
  const [config] = await db
    .insert(schema.configs)
    .values({
      slug,
      title: `Config ${slug}`,
      authorId: 'u1',
      interpreter: 'bash',
      status: 'published',
    })
    .returning()
  if (!config) throw new Error('config seed failed')
  const [version] = await db
    .insert(schema.configVersions)
    .values({
      configId: config.id,
      versionNumber: 1,
      source: 'echo hi',
      interpreter: 'bash',
      contentSha256: `sha-${slug}`,
      status: 'approved',
      generatedContent,
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
  await seedConfig('with-content', CONTENT)
  await seedConfig('without-content', null)
})

afterAll(async () => {
  await client.close()
})

describe('ConfigDetail.generatedContent', () => {
  it('returns the stored three-section object', async () => {
    const detail = await getConfigBySlug(db, 'with-content')
    expect(detail?.generatedContent).toEqual(CONTENT)
  })

  it('is null when no content has been generated', async () => {
    const detail = await getConfigBySlug(db, 'without-content')
    expect(detail).not.toBeNull()
    expect(detail?.generatedContent).toBeNull()
  })
})
