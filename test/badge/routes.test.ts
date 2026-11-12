import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { configBadgeResponse, modBadgeResponse } from '@/badge/routes'
import * as schema from '@/db/schema'
import { openTestDb, seedMod, type TestDb } from '../mods/seed-mods'

let db: TestDb
let close: () => Promise<void>

async function seedConfig(slug: string, status: string, copyCount = 0) {
  const [cfg] = await db
    .insert(schema.configs)
    .values({ slug, status, copyCount, authorId: 'u1' })
    .returning()
  const [ver] = await db
    .insert(schema.configVersions)
    .values({
      configId: cfg?.id as string,
      versionNumber: 1,
      title: 'Author Title Words',
      description: 'An author description.',
      source: 'echo hi',
      interpreter: 'bash',
      contentSha256: slug.padEnd(64, '0').slice(0, 64),
      status: 'approved',
    })
    .returning()
  await db
    .update(schema.configs)
    .set({ currentVersionId: ver?.id as string })
    .where(eq(schema.configs.id, cfg?.id as string))
}

async function seedPublishedMod(slug: string, commitChar: string, copyCount: number) {
  const { modId } = await seedMod(db, slug, 'published', commitChar)
  await db.update(schema.mods).set({ copyCount }).where(eq(schema.mods.id, modId))
}

beforeAll(async () => {
  ;({ db, close } = await openTestDb())
  await db.insert(schema.user).values({
    id: 'u1',
    name: 'Author Person',
    username: 'authorperson',
    email: 'a@test.com',
    emailVerified: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  })
  await seedPublishedMod('mod-none', 'a', 0)
  await seedPublishedMod('mod-two', 'b', 2)
  await seedPublishedMod('mod-three', 'c', 3)
  await seedPublishedMod('mod-many', 'e', 1234)
  await seedMod(db, 'mod-draft', 'draft', 'f')
  await seedMod(db, 'mod-removed', 'removed', '9')
  await seedConfig('line-many', 'published', 1234)
  await seedConfig('line-two', 'published', 2)
  await seedConfig('line-draft', 'draft')
  await seedConfig('line-removed', 'removed')
})
afterAll(async () => {
  await close()
})

/** The badge's own words, as a screen reader and a hover tooltip read them. */
function spokenText(svg: string): string | undefined {
  return /aria-label="([^"]*)"/.exec(svg)?.[1]
}

describe('mod badge', () => {
  it.each([
    ['mod-none', 'statuslin.es: reviewed'],
    ['mod-two', 'statuslin.es: reviewed'],
    ['mod-three', 'statuslin.es: reviewed · 3 installs'],
    ['mod-many', 'statuslin.es: reviewed · 1234 installs'],
  ])('%s reads "%s"', async (slug, words) => {
    const res = await modBadgeResponse(db, slug)

    expect(res.status).toBe(200)
    expect(spokenText(await res.text())).toBe(words)
  })

  it.each(['mod-draft', 'mod-removed', 'nope'])('is a 404 for %s', async (slug) => {
    expect((await modBadgeResponse(db, slug)).status).toBe(404)
  })

  it('is an SVG that GitHub can cache for an hour and no browser sniffs', async () => {
    const res = await modBadgeResponse(db, 'mod-many')

    expect(res.headers.get('content-type')).toBe('image/svg+xml; charset=utf-8')
    expect(res.headers.get('cache-control')).toBe('public, max-age=3600')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect((await res.text()).startsWith('<svg')).toBe(true)
  })

  // A mod's seeded title is its slug, so this also proves the title stays out.
  it('draws no text from the listing', async () => {
    const svg = await (await modBadgeResponse(db, 'mod-many')).text()

    expect(svg).not.toContain('mod-many')
    expect(svg).not.toContain('octocat')
  })
})

describe('status line badge', () => {
  it.each([
    ['line-two', 'statuslin.es: reviewed'],
    ['line-many', 'statuslin.es: reviewed · 1234 installs'],
  ])('%s reads "%s"', async (slug, words) => {
    const res = await configBadgeResponse(db, slug)

    expect(res.status).toBe(200)
    expect(spokenText(await res.text())).toBe(words)
  })

  it.each(['line-draft', 'line-removed', 'nope'])('is a 404 for %s', async (slug) => {
    expect((await configBadgeResponse(db, slug)).status).toBe(404)
  })

  it('has the same headers as the mod badge', async () => {
    const res = await configBadgeResponse(db, 'line-many')

    expect(res.headers.get('content-type')).toBe('image/svg+xml; charset=utf-8')
    expect(res.headers.get('cache-control')).toBe('public, max-age=3600')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
  })

  it('draws no text from the listing', async () => {
    const svg = await (await configBadgeResponse(db, 'line-many')).text()

    expect(svg).not.toContain('line-many')
    expect(svg).not.toContain('Author Title Words')
    expect(svg).not.toContain('An author description.')
    expect(svg).not.toContain('authorperson')
  })
})
