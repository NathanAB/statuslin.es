import { PGlite } from '@electric-sql/pglite'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { buildMarketplace } from '@/mods/marketplace'
import {
  getMarketplaceRows,
  getModDetail,
  hasAnyMods,
  MOD_SCENARIO_KEY,
  recordModCopy,
  versionIsRendered,
} from '@/mods/queries'

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

  it('lists a published mod whose current version has no preview and no screenshot', async () => {
    await addMod('unrendered', 'published', 'none')

    expect(await listedSlugs()).toEqual(['unrendered'])
  })

  it.each([
    ['a draft mod', 'draft'],
    ['a removed mod', 'removed'],
  ] as const)('leaves out %s', async (_name, status) => {
    await addMod('excluded', status, 'scenario-preview')

    expect(await listedSlugs()).toEqual([])
  })

  it('leaves out a published mod whose current version belongs to another mod', async () => {
    const victim = await addMod('victim', 'draft', 'scenario-preview')
    const { modId } = await addMod('hijacked', 'published', 'none')
    await db
      .update(schema.mods)
      .set({ currentVersionId: victim.versionId })
      .where(eq(schema.mods.id, modId))

    expect(await listedSlugs()).toEqual([])
  })

  it("serves the current version's commit, not an older one", async () => {
    const { modId, versionId: older } = await addMod('repinned', 'published', 'none')
    const current = await addVersion(modId, 2, 'none')
    await db.update(schema.mods).set({ currentVersionId: current }).where(eq(schema.mods.id, modId))
    const shaOf = async (id: string) =>
      (await db.query.modVersions.findFirst({ where: eq(schema.modVersions.id, id) }))?.commitSha

    const [row] = await getMarketplaceRows(db)

    expect(row?.commitSha).toBe(await shaOf(current))
    expect(row?.commitSha).not.toBe(await shaOf(older))
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

describe('hasAnyMods', () => {
  it('is false when the mods table has no rows', async () => {
    expect(await hasAnyMods(db)).toBe(false)
  })

  it.each([
    'removed',
    'draft',
  ] as const)('is true when the only mod is %s, though none is listed', async (status) => {
    await addMod('lonely', status, 'scenario-preview')

    expect(await listedSlugs()).toEqual([])
    expect(await hasAnyMods(db)).toBe(true)
  })
})

describe('versionIsRendered', () => {
  async function renderedVersionIds(): Promise<string[]> {
    const rows = await db
      .select({ id: schema.modVersions.id })
      .from(schema.modVersions)
      .where(versionIsRendered)
    return rows.map((r) => r.id)
  }

  it.each([
    ['a clean-main preview', 'scenario-preview', true],
    ['only a Desktop screenshot', 'screenshot', true],
    ['only a preview in another scenario', 'other-scenario', false],
    ['no preview and no screenshot', 'none', false],
  ] as const)('judges a version with %s', async (_name, rendering, rendered) => {
    const { versionId } = await addMod('judged', 'published', rendering)

    expect(await renderedVersionIds()).toEqual(rendered ? [versionId] : [])
  })
})

describe('getModDetail', () => {
  it('returns a published mod with its current version and clean-main preview', async () => {
    const { modId } = await addMod('meter', 'published', 'scenario-preview', 'plugins/meter')
    const footprint = { events: ['ui.render{component=AbovePrompt}'], calls: ['$.fs.read'] }
    await db
      .update(schema.modVersions)
      .set({ footprint })
      .where(eq(schema.modVersions.modId, modId))

    expect(await getModDetail(db, 'meter')).toEqual({
      id: modId,
      slug: 'meter',
      pluginName: 'meter',
      title: 'meter',
      description: '',
      authorGithub: 'octocat',
      repoUrl: 'https://github.com/octocat/mods',
      path: 'plugins/meter',
      commitSha: expect.stringMatching(/^[0-9a-f]{40}$/),
      license: 'MIT',
      footprint,
      desktopScreenshot: null,
      preview: [{ text: 'meter' }],
      generatedContent: null,
    })
  })

  it('returns a screenshot-only mod with no preview', async () => {
    await addMod('anywhere', 'published', 'screenshot')

    expect(await getModDetail(db, 'anywhere')).toMatchObject({
      desktopScreenshot: '/mods/screenshots/meter.png',
      preview: null,
    })
  })

  it('returns the version generated content, and null for a stored value that is not page copy', async () => {
    const content = { whatItShows: ['A meter'], requirements: [], behaviorNotes: [] }
    const { versionId } = await addMod('copy', 'published', 'none')
    const { versionId: badId } = await addMod('bad-copy', 'published', 'none')
    await db
      .update(schema.modVersions)
      .set({ generatedContent: content })
      .where(eq(schema.modVersions.id, versionId))
    await db
      .update(schema.modVersions)
      .set({ generatedContent: { whatItShows: 'not a list' } })
      .where(eq(schema.modVersions.id, badId))

    expect((await getModDetail(db, 'copy'))?.generatedContent).toEqual(content)
    expect((await getModDetail(db, 'bad-copy'))?.generatedContent).toBeNull()
  })

  it('ignores a preview from another scenario', async () => {
    await addMod('other', 'published', 'other-scenario')

    expect((await getModDetail(db, 'other'))?.preview).toBeNull()
  })

  it.each([
    ['a draft mod', 'draft'],
    ['a removed mod', 'removed'],
  ] as const)('returns null for %s', async (_name, status) => {
    await addMod('hidden', status, 'scenario-preview')

    expect(await getModDetail(db, 'hidden')).toBeNull()
  })

  it('returns null for an unknown slug', async () => {
    expect(await getModDetail(db, 'nope')).toBeNull()
  })

  it('returns null when the current version belongs to another mod', async () => {
    const victim = await addMod('victim', 'draft', 'scenario-preview')
    const { modId } = await addMod('hijacked', 'published', 'none')
    await db
      .update(schema.mods)
      .set({ currentVersionId: victim.versionId })
      .where(eq(schema.mods.id, modId))

    expect(await getModDetail(db, 'hijacked')).toBeNull()
  })
})

describe('recordModCopy', () => {
  async function copyRows(modId: string) {
    return db.select().from(schema.modCopyEvents).where(eq(schema.modCopyEvents.modId, modId))
  }

  it('counts one copy per IP hash and records one row', async () => {
    const { modId } = await addMod('meter', 'published', 'scenario-preview')

    expect(await recordModCopy(db, modId, 'hash-a')).toBe(1)
    expect(await recordModCopy(db, modId, 'hash-a')).toBe(1)
    expect(await recordModCopy(db, modId, 'hash-b')).toBe(2)

    expect((await copyRows(modId)).map((r) => r.ipHash).sort()).toEqual(['hash-a', 'hash-b'])
  })

  it('reports the count without recording when there is no trustworthy IP', async () => {
    const { modId } = await addMod('meter', 'published', 'scenario-preview')

    expect(await recordModCopy(db, modId, null)).toBe(0)
    expect(await copyRows(modId)).toEqual([])
  })

  it.each(['draft', 'removed'] as const)('records nothing for a %s mod', async (status) => {
    const { modId } = await addMod('hidden', status, 'scenario-preview')

    expect(await recordModCopy(db, modId, 'hash-a')).toBe(0)
    expect(await copyRows(modId)).toEqual([])
  })

  it('returns 0 for a malformed id', async () => {
    expect(await recordModCopy(db, 'not-a-uuid', 'hash-a')).toBe(0)
  })
})
