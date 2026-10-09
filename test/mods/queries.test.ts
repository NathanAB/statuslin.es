import { PGlite } from '@electric-sql/pglite'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { buildMarketplace } from '@/mods/marketplace'
import { getMarketplaceRows, MOD_SCENARIO_KEY } from '@/mods/queries'

let client: PGlite
let db: ReturnType<typeof drizzle<typeof schema>>
let shaSeed = 0

beforeAll(async () => {
  client = new PGlite()
  db = drizzle({ client, schema })
  await migrate(db, { migrationsFolder: './drizzle' })
})
beforeEach(async () => {
  await db.delete(schema.mods)
})
afterAll(async () => {
  await client.close()
})

function nextSha(): string {
  shaSeed += 1
  return shaSeed.toString(16).padStart(40, '0')
}

type Rendering = 'scenario-preview' | 'other-scenario' | 'screenshot' | 'none'

async function addVersion(modId: string, versionNumber: number, rendering: Rendering, path = '') {
  const [version] = await db
    .insert(schema.modVersions)
    .values({
      modId,
      versionNumber,
      repoUrl: 'https://github.com/octocat/mods',
      path,
      commitSha: nextSha(),
      license: 'MIT',
      footprint: { events: [], calls: [] },
      validatedWith: '2.1.0',
      desktopScreenshot: rendering === 'screenshot' ? '/mods/screenshots/meter.png' : null,
    })
    .returning()
  const versionId = version?.id as string
  if (rendering === 'scenario-preview' || rendering === 'other-scenario') {
    await db.insert(schema.modPreviews).values({
      modVersionId: versionId,
      scenarioKey: rendering === 'scenario-preview' ? MOD_SCENARIO_KEY : 'git-dirty',
      segments: [{ text: 'meter' }],
      claudeCodeVersion: '2.1.0',
    })
  }
  return versionId
}

async function addMod(
  slug: string,
  status: schema.ModStatus,
  rendering: Rendering,
  path = '',
): Promise<{ modId: string; versionId: string }> {
  const [mod] = await db
    .insert(schema.mods)
    .values({ slug, pluginName: slug, title: slug, authorGithub: 'octocat', status })
    .returning()
  const modId = mod?.id as string
  const versionId = await addVersion(modId, 1, rendering, path)
  await db.update(schema.mods).set({ currentVersionId: versionId }).where(eq(schema.mods.id, modId))
  return { modId, versionId }
}

async function listedSlugs(): Promise<string[]> {
  return (await getMarketplaceRows(db)).map((r) => r.slug)
}

describe('getMarketplaceRows', () => {
  it('gives every listed plugin an https .git source pinned to a 40-hex sha', async () => {
    await addMod('at-root', 'published', 'scenario-preview')
    await addMod('in-folder', 'published', 'screenshot', 'plugins/meter')

    const { plugins } = buildMarketplace('https://statuslin.es', await getMarketplaceRows(db))

    expect(plugins.map((p) => p.source.source)).toEqual(['url', 'git-subdir'])
    for (const { source } of plugins) {
      expect(source.url).toMatch(/^https:\/\/.+\.git$/)
      expect(source.sha).toMatch(/^[0-9a-f]{40}$/)
    }
  })

  it('lists a published mod whose current version has a clean-main preview', async () => {
    await addMod('rendered', 'published', 'scenario-preview')

    expect(await listedSlugs()).toEqual(['rendered'])
  })

  it('lists a published mod whose current version has only a Desktop screenshot', async () => {
    await addMod('screenshot-only', 'published', 'screenshot')

    expect(await listedSlugs()).toEqual(['screenshot-only'])
  })

  it.each([
    ['a draft mod', 'draft', 'scenario-preview'],
    ['a removed mod', 'removed', 'scenario-preview'],
    ['an unrendered published mod', 'published', 'none'],
    ['a published mod previewed only in another scenario', 'published', 'other-scenario'],
  ] as const)('leaves out %s', async (_name, status, rendering) => {
    await addMod('excluded', status, rendering)

    expect(await listedSlugs()).toEqual([])
  })

  it('judges the current version, not an older rendered one', async () => {
    const { modId } = await addMod('repinned', 'published', 'scenario-preview')
    const unrendered = await addVersion(modId, 2, 'none')
    await db
      .update(schema.mods)
      .set({ currentVersionId: unrendered })
      .where(eq(schema.mods.id, modId))

    expect(await listedSlugs()).toEqual([])
  })

  it('returns the fields the marketplace entry needs, ordered by plugin name', async () => {
    await addMod('zeta', 'published', 'scenario-preview')
    await addMod('alpha', 'published', 'screenshot')
    await db
      .update(schema.mods)
      .set({ description: 'First', tags: ['minimal'] })
      .where(eq(schema.mods.slug, 'alpha'))

    const rows = await getMarketplaceRows(db)

    expect(rows.map((r) => r.pluginName)).toEqual(['alpha', 'zeta'])
    expect(rows[0]).toEqual({
      slug: 'alpha',
      pluginName: 'alpha',
      description: 'First',
      authorGithub: 'octocat',
      tags: ['minimal'],
      repoUrl: 'https://github.com/octocat/mods',
      path: '',
      commitSha: expect.stringMatching(/^[0-9a-f]{40}$/),
      license: 'MIT',
    })
  })
})
