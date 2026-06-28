import { createHash } from 'node:crypto'
import { eq, like } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { configs, configVersions, user } from '@/db/schema'
import { assertNotProduction } from '@/lib/env'
import { highlightSource } from '@/lib/highlight'
import { SCENARIOS } from '@/render/scenarios'
import { storePreviews } from '@/render/store'
import type { AnsiSegment, BehaviorTrace, RenderedPreview, Scenario } from '@/render/types'

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

/**
 * Volume seeder for load testing. Creates N *published* configs (slugs `loadtest-0001…`) with
 * varied upvote/copy/created-at so all three gallery sorts produce realistic orderings, and a
 * full set of previews (all 8 scenarios) per config so both the gallery card and the detail page
 * render. Inserts directly — it deliberately does NOT go through `submitConfig`, whose 10/hour
 * per-author rate limit (src/submit/submit.ts) would block volume seeding, nor through the E2B
 * render pipeline (no sandbox cost). Idempotent and scoped to `loadtest-*`: re-running tops up to
 * the requested count and never touches curated data. Pair with `teardown.ts` to clean up.
 */

/** Shared by seed + teardown so the "what counts as load-test data" rule lives in one place. */
export const LOADTEST_SLUG_PREFIX = 'loadtest-'

export function loadtestSlug(i: number): string {
  return `${LOADTEST_SLUG_PREFIX}${String(i).padStart(4, '0')}`
}

/** A handful of synthetic authors, round-robin assigned, so cards show varied author chips. */
export const LOADTEST_AUTHORS = [
  { id: 'loadtest-author-1', name: 'Load Test One', username: 'loadtester1' },
  { id: 'loadtest-author-2', name: 'Load Test Two', username: 'loadtester2' },
  { id: 'loadtest-author-3', name: 'Load Test Three', username: 'loadtester3' },
  { id: 'loadtest-author-4', name: 'Load Test Four', username: 'loadtester4' },
  { id: 'loadtest-author-5', name: 'Load Test Five', username: 'loadtester5' },
] as const

const DEFAULT_COUNT = 500
const MS_PER_HOUR = 60 * 60 * 1000
const EMPTY_TRACE: BehaviorTrace = { networkAttempts: [], sensitiveReads: [], spawnedProcesses: [] }

export interface LoadSeedSummary {
  requested: number
  created: number
  skipped: number
  authors: number
}

function seg(text: string, fg: string | null, opts: Partial<AnsiSegment> = {}): AnsiSegment {
  return { text, fg, bg: null, bold: false, italic: false, underline: false, ...opts }
}

/** A believable statusline (model · scenario · context% · cost), varied per config + scenario, so
 * the stored `segments` JSON is realistic in size and the rendered cards aren't all identical. */
function buildSegments(i: number, scenario: Scenario): AnsiSegment[] {
  const pct = (i * 7) % 100
  const cost = (((i * 13) % 500) / 100).toFixed(2)
  return [
    seg(loadtestSlug(i), '#56b6c2', { bold: true }),
    seg('  ', null),
    seg(scenario.shortLabel, '#98c379'),
    seg('  ', null),
    seg(`${pct}%`, '#e5c07b'),
    seg('  ', null),
    seg(`$${cost}`, '#c678dd'),
  ]
}

function buildPreviews(i: number): RenderedPreview[] {
  return SCENARIOS.map((scenario) => {
    const segments = buildSegments(i, scenario)
    return {
      scenarioKey: scenario.key,
      segments,
      rawStdout: segments.map((s) => s.text).join(''),
      exitCode: 0,
      timedOut: false,
      trace: EMPTY_TRACE,
    }
  })
}

/** Each config's source embeds its slug, so every config hashes to a unique `contentSha256`
 * (previews are keyed by that hash — sharing one would clobber another config's previews). */
function buildSource(i: number): string {
  return [
    '#!/usr/bin/env bash',
    `# loadtest synthetic config ${loadtestSlug(i)}`,
    'json=$(cat)',
    'model=$(echo "$json" | jq -r ".model.display_name")',
    'printf "%s" "$model"',
  ].join('\n')
}

async function ensureAuthors(db: Db): Promise<number> {
  for (const a of LOADTEST_AUTHORS) {
    await db
      .insert(user)
      .values({
        id: a.id,
        name: a.name,
        username: a.username,
        email: `${a.username}@loadtest.local`,
        image: 'https://avatars.githubusercontent.com/u/0',
        emailVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoNothing()
  }
  return LOADTEST_AUTHORS.length
}

export async function seedLoadConfigs(db: Db, opts: { count: number }): Promise<LoadSeedSummary> {
  const authors = await ensureAuthors(db)
  const base = Date.now()
  // One query for every existing load-test slug, instead of a per-config existence round-trip:
  // this runs against a remote Neon staging DB, where 500 sequential round-trips would be slow
  // and fragile (a dropped connection mid-loop).
  const existingSlugs = new Set(
    (
      await db
        .select({ slug: configs.slug })
        .from(configs)
        .where(like(configs.slug, `${LOADTEST_SLUG_PREFIX}%`))
    ).map((r) => r.slug),
  )
  let created = 0
  let skipped = 0

  for (let i = 1; i <= opts.count; i++) {
    const slug = loadtestSlug(i)
    if (existingSlugs.has(slug)) {
      skipped++
      continue
    }

    const author = LOADTEST_AUTHORS[(i - 1) % LOADTEST_AUTHORS.length]
    if (!author) throw new Error('no load-test author available')
    const source = buildSource(i)
    const contentSha256 = createHash('sha256').update(source).digest('hex')
    // Spread created-at back in time and vary the counters so new/top/trending all differ.
    const createdAt = new Date(base - i * MS_PER_HOUR)

    const [cfg] = await db
      .insert(configs)
      .values({
        slug,
        title: `Load Test ${i}`,
        description: `Synthetic load-test config #${i}.`,
        authorId: author.id,
        interpreter: 'bash',
        status: 'published',
        upvoteCount: (i * 37) % 300,
        copyCount: (i * 53) % 500,
        createdAt,
      })
      .returning()
    if (!cfg) throw new Error(`insert configs returned no row for ${slug}`)

    const [ver] = await db
      .insert(configVersions)
      .values({
        configId: cfg.id,
        versionNumber: 1,
        source,
        interpreter: 'bash',
        contentSha256,
        // Precomputed like a real submission, so the load test exercises the cached detail path.
        sourceHtml: await highlightSource(source, 'bash'),
        status: 'approved',
        reviewedBy: author.id,
        reviewedAt: createdAt,
      })
      .returning()
    if (!ver) throw new Error(`insert configVersions returned no row for ${slug}`)

    await db.update(configs).set({ currentVersionId: ver.id }).where(eq(configs.id, cfg.id))
    await storePreviews(db, contentSha256, buildPreviews(i))
    created++

    if (created % 50 === 0) console.log(`[loadtest seed]   …${created} created`)
  }

  return { requested: opts.count, created, skipped, authors }
}

function parseCount(argv: string[]): number {
  const inline = argv.find((a) => a.startsWith('--count='))
  if (inline) {
    const n = Number(inline.slice('--count='.length))
    if (Number.isFinite(n) && n > 0) return Math.floor(n)
  }
  const idx = argv.indexOf('--count')
  const next = idx >= 0 ? argv[idx + 1] : undefined
  if (next) {
    const n = Number(next)
    if (Number.isFinite(n) && n > 0) return Math.floor(n)
  }
  return DEFAULT_COUNT
}

// CLI entry. Behind import.meta.main so importing this module (e.g. from the test) never opens a
// Postgres connection — the real `@/db` is imported lazily only when run directly.
if (import.meta.main) {
  assertNotProduction('loadtest seed')
  const count = parseCount(process.argv.slice(2))
  const { db } = await import('@/db')
  console.log(`[loadtest seed] seeding ${count} configs into DATABASE_URL…`)
  const summary = await seedLoadConfigs(db, { count })
  console.log(
    `[loadtest seed] done — requested=${summary.requested} created=${summary.created} skipped=${summary.skipped} authors=${summary.authors}`,
  )
  process.exit(0)
}
