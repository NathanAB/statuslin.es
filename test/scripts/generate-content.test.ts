import { PGlite } from '@electric-sql/pglite'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { GeneratedContent } from '@/content/types'
import * as schema from '@/db/schema'
import { storePreviews } from '@/render/store'
import {
  generateContentForConfig,
  listPublishedSlugsMissingContent,
} from '../../scripts/generate-content'

let client: PGlite
let db: ReturnType<typeof drizzle<typeof schema>>

const CONTENT: GeneratedContent = {
  whatItShows: ['Current git branch'],
  requirements: ['bash'],
  behaviorNotes: ['Branch segment disappears outside a git repo'],
}

async function seedConfig(
  slug: string,
  opts: { status?: string; generatedContent?: GeneratedContent | null } = {},
): Promise<string> {
  const [config] = await db
    .insert(schema.configs)
    .values({
      slug,
      title: `Config ${slug}`,
      authorId: 'u1',
      interpreter: 'bash',
      status: opts.status ?? 'published',
    })
    .returning()
  if (!config) throw new Error('config seed failed')
  const [version] = await db
    .insert(schema.configVersions)
    .values({
      configId: config.id,
      versionNumber: 1,
      source: 'echo "$BRANCH"',
      interpreter: 'bash',
      contentSha256: `sha-${slug}`,
      status: 'approved',
      generatedContent: opts.generatedContent ?? null,
    })
    .returning()
  if (!version) throw new Error('version seed failed')
  await db
    .update(schema.configs)
    .set({ currentVersionId: version.id })
    .where(eq(schema.configs.id, config.id))
  return version.id
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
})

afterAll(async () => {
  await client.close()
})

describe('generateContentForConfig', () => {
  it('builds a prompt from the version + previews and stores the validated content', async () => {
    const versionId = await seedConfig('happy-path')
    await storePreviews(db, 'sha-happy-path', [
      {
        scenarioKey: 'clean-main',
        segments: [],
        rawStdout: 'main | Opus',
        exitCode: 0,
        timedOut: false,
        trace: { networkAttempts: [], sensitiveReads: [], spawnedProcesses: [] },
      },
    ])
    const prompts: string[] = []
    const fakeRun = async (prompt: string) => {
      prompts.push(prompt)
      return JSON.stringify(CONTENT)
    }

    const result = await generateContentForConfig(db, 'happy-path', fakeRun)

    expect(result).toEqual(CONTENT)
    expect(prompts).toHaveLength(1)
    expect(prompts[0]).toContain('echo "$BRANCH"') // script source reached the prompt
    expect(prompts[0]).toContain('main | Opus') // rendered preview reached the prompt
    const [row] = await db
      .select({ generatedContent: schema.configVersions.generatedContent })
      .from(schema.configVersions)
      .where(eq(schema.configVersions.id, versionId))
    expect(row?.generatedContent).toEqual(CONTENT)
  })

  it('throws on an unknown slug', async () => {
    const fakeRun = async () => JSON.stringify(CONTENT)
    await expect(generateContentForConfig(db, 'no-such-slug', fakeRun)).rejects.toThrow(
      /no config found/i,
    )
  })

  it('throws on invalid model output and leaves the column untouched', async () => {
    const versionId = await seedConfig('bad-output')
    const fakeRun = async () => 'I refuse to answer in JSON'
    await expect(generateContentForConfig(db, 'bad-output', fakeRun)).rejects.toThrow(
      /no JSON object/i,
    )
    const [row] = await db
      .select({ generatedContent: schema.configVersions.generatedContent })
      .from(schema.configVersions)
      .where(eq(schema.configVersions.id, versionId))
    expect(row?.generatedContent).toBeNull()
  })
})

describe('listPublishedSlugsMissingContent', () => {
  it('lists published configs without content and skips ones that have it or are unpublished', async () => {
    await seedConfig('missing-a')
    await seedConfig('already-done', { generatedContent: CONTENT })
    await seedConfig('still-draft', { status: 'draft' })

    const slugs = await listPublishedSlugsMissingContent(db)

    expect(slugs).toContain('missing-a')
    expect(slugs).not.toContain('already-done')
    expect(slugs).not.toContain('still-draft')
  })
})
