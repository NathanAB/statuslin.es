import { PGlite } from '@electric-sql/pglite'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { prepareContentGenerationRequest } from '@/content/generation-workflow'
import * as schema from '@/db/schema'
import {
  getCardsByCopies,
  getConfigBySlug,
  getPublishedConfigs,
  getRelatedConfigs,
} from '@/gallery/queries'

let client: PGlite
let db: ReturnType<typeof drizzle<typeof schema>>

const LIVE = { title: 'Live title', description: 'Live description', interpreter: 'bash' }
const PENDING = { title: 'Pending title', description: 'Pending description', interpreter: 'node' }

async function publish(slug: string, text: typeof LIVE): Promise<string> {
  const [config] = await db
    .insert(schema.configs)
    .values({ slug, authorId: 'u1', status: 'published' })
    .returning()
  if (!config) throw new Error('config seed failed')
  const [version] = await db
    .insert(schema.configVersions)
    .values({
      configId: config.id,
      versionNumber: 1,
      ...text,
      source: 'echo live',
      contentSha256: `sha-${slug}-live`,
      status: 'approved',
    })
    .returning()
  if (!version) throw new Error('version seed failed')
  await db
    .update(schema.configs)
    .set({ currentVersionId: version.id })
    .where(eq(schema.configs.id, config.id))
  return config.id
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
  const configId = await publish('updated', LIVE)
  await db.insert(schema.configVersions).values({
    configId,
    versionNumber: 2,
    ...PENDING,
    source: 'console.log("pending")',
    contentSha256: 'sha-updated-pending',
    status: 'pending',
  })
  await publish('neighbour', { title: 'Neighbour', description: '', interpreter: 'bash' })
})

afterAll(async () => {
  await client.close()
})

describe('public reads while a version with different text is pending', () => {
  it('the config page shows the live title, description and interpreter', async () => {
    const detail = await getConfigBySlug(db, 'updated')
    expect(detail).toMatchObject(LIVE)
    expect(detail?.source).toBe('echo live')
  })

  it('gallery and facet cards show the live text', async () => {
    const cards = [...(await getPublishedConfigs(db, 'new')), ...(await getCardsByCopies(db))]
    const updated = cards.filter((card) => card.slug === 'updated')
    expect(updated).toHaveLength(2)
    for (const card of updated) expect(card).toMatchObject(LIVE)
  })

  it('related configs show the live title and interpreter', async () => {
    const related = await getRelatedConfigs(db, 'neighbour')
    expect(related.find((r) => r.slug === 'updated')).toMatchObject({
      title: LIVE.title,
      interpreter: LIVE.interpreter,
    })
  })

  it('generate:content prompts carry the live listing text', async () => {
    const request = await prepareContentGenerationRequest(db, 'updated')
    for (const prompt of [request.contentPrompt, request.tagsPrompt]) {
      expect(prompt).toContain(LIVE.title)
      expect(prompt).toContain(LIVE.description)
      expect(prompt).not.toContain(PENDING.title)
      expect(prompt).not.toContain(PENDING.description)
    }
  })
})
