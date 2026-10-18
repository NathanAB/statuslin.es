import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import * as schema from '@/db/schema'
import { insertSubmission } from '../fixtures/submission'
import { openTestDb, seedMod, type TestDb } from '../mods/seed-mods'
import { addPublishedConfig } from './seed-configs'

const testState = vi.hoisted(() => ({ db: null as unknown }))

vi.mock('@/db', () => ({
  get db() {
    return testState.db
  },
}))
vi.mock('@tanstack/react-start', () => ({
  createServerOnlyFn: (handler: () => unknown) => handler,
  createServerFn: () => {
    const handler = () => () => undefined
    return { handler, validator: () => ({ handler }) }
  },
}))

const BASE = 'https://statuslin.es'
// Enough shared jobs with both compared tools for a config to be listed on their pages.
const COMPARE_JOBS = ['git', 'cost', 'quota']
// src/compare/tools.ts: both tools' facts were last checked on this day.
const TOOLS_VERIFIED_AT = '2026-09-24'
const AUTHOR_ID = 'seed-configs-author'

const closers: Array<() => Promise<void>> = []

beforeAll(() => {
  vi.stubEnv('BETTER_AUTH_URL', `${BASE}/`)
})
afterAll(async () => {
  vi.unstubAllEnvs()
  for (const close of closers) await close()
})

async function freshDb(): Promise<TestDb> {
  const { db, close } = await openTestDb()
  closers.push(close)
  testState.db = db
  return db
}

async function sitemapXml(): Promise<string> {
  const { sitemapWithModsForRoute } = await import('@/mods/discovery')
  return (await sitemapWithModsForRoute()).text()
}

function entryFor(xml: string, path: string): string {
  return (
    xml
      .split('  <url>')
      .find((entry) => entry.includes(`<loc>${BASE}${path}</loc>`))
      ?.split('  </url>')[0] ?? ''
  )
}

async function publishConfig(
  db: TestDb,
  slug: string,
  opts: { copyCount: number; createdAt: string },
): Promise<{ configId: string; versionId: string }> {
  const configId = await addPublishedConfig(db, slug, { allTags: COMPARE_JOBS })
  const [config] = await db
    .update(schema.configs)
    .set({ copyCount: opts.copyCount, createdAt: new Date(opts.createdAt) })
    .where(eq(schema.configs.id, configId))
    .returning({ versionId: schema.configs.currentVersionId })
  if (!config?.versionId) throw new Error(`config ${slug} has no current version`)
  return { configId, versionId: config.versionId }
}

async function copiedAt(db: TestDb, configId: string, at: string): Promise<void> {
  await db
    .insert(schema.copyEvents)
    .values({ configId, ipHash: `ip-${at}`, createdAt: new Date(at) })
}

describe('sitemap lastmod when the newest copy is the newest change', () => {
  let xml: string

  beforeAll(async () => {
    const db = await freshDb()
    // Ten listed status lines, all older than the tools' fact check.
    for (let i = 0; i < 10; i++) {
      const { configId } = await publishConfig(db, `line-${i}`, {
        copyCount: 10 - i,
        createdAt: '2026-09-01T00:00:00Z',
      })
      if (i === 0) await copiedAt(db, configId, '2026-10-14T09:00:00Z')
    }
    // Newest of all, but never copied: it ranks 11th, so neither page lists it.
    await publishConfig(db, 'unlisted-new', { copyCount: 0, createdAt: '2026-10-30T00:00:00Z' })
    xml = await sitemapXml()
  })

  it('dates the best page by its newest copy, ignoring status lines it does not list', () => {
    expect(entryFor(xml, '/status-lines/best')).toContain('<lastmod>2026-10-14</lastmod>')
  })

  it('dates a comparison page by its tool facts check when every listed status line is older', () => {
    expect(entryFor(xml, '/alternatives/ccstatusline')).toContain(
      `<lastmod>${TOOLS_VERIFIED_AT}</lastmod>`,
    )
    expect(entryFor(xml, '/compare/ccstatusline-vs-claude-powerline')).toContain(
      `<lastmod>${TOOLS_VERIFIED_AT}</lastmod>`,
    )
  })
})

describe('sitemap lastmod when a listed status line went live last', () => {
  let xml: string

  beforeAll(async () => {
    const db = await freshDb()
    const first = await publishConfig(db, 'first', {
      copyCount: 3,
      createdAt: '2026-09-01T00:00:00Z',
    })
    await copiedAt(db, first.configId, '2026-09-05T00:00:00Z')
    const updated = await publishConfig(db, 'updated', {
      copyCount: 2,
      createdAt: '2026-09-01T00:00:00Z',
    })
    await insertSubmission(db, updated.versionId, AUTHOR_ID, {
      status: 'approved',
      reviewedAt: new Date('2026-10-03T15:00:00Z'),
    })
    await publishConfig(db, 'third', { copyCount: 1, createdAt: '2026-09-01T00:00:00Z' })

    const meter = await seedMod(db, 'meter', 'published', 'a')
    await db
      .update(schema.modVersions)
      .set({ createdAt: new Date('2026-09-30T12:00:00Z') })
      .where(eq(schema.modVersions.id, meter.versionId))
    await db.insert(schema.submissions).values({
      id: meter.versionId,
      kind: 'mod',
      modVersionId: meter.versionId,
      submittedBy: AUTHOR_ID,
      status: 'approved',
      reviewedAt: new Date('2026-10-08T10:00:00Z'),
    })
    xml = await sitemapXml()
  })

  it('dates the best page by a listed status line approved after the newest copy', () => {
    expect(entryFor(xml, '/status-lines/best')).toContain('<lastmod>2026-10-03</lastmod>')
  })

  it('dates a comparison page by a listed status line approved after its facts check', () => {
    expect(entryFor(xml, '/alternatives/ccstatusline')).toContain('<lastmod>2026-10-03</lastmod>')
  })

  it('dates a submitted mod by its approval, not by when its version was created', () => {
    expect(entryFor(xml, '/mods/meter')).toContain('<lastmod>2026-10-08</lastmod>')
  })
})

describe('sitemap lastmod with an empty gallery', () => {
  it('lists the best page with no date', async () => {
    await freshDb()
    const entry = entryFor(await sitemapXml(), '/status-lines/best')

    expect(entry).toContain('<loc>')
    expect(entry).not.toContain('<lastmod>')
  })
})
