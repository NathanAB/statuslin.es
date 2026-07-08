import { eq, inArray } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { isPooledUrl } from '@/db/is-pooled'
import * as schema from '@/db/schema'
import { computeAllTags } from '@/lib/derived-tags'
import { requireEnv } from '@/lib/env'

/**
 * One-time backfill: add the `weather` and `markets` curated tags to the published configs that
 * show live weather / financial-market data, then recompute their allTags. The tags were added to
 * the registry after these configs were already classified, and the model classifier
 * (scripts/backfill-tags.ts) only (re)tags configs whose tags are still empty — so this targeted
 * pass is how the existing ones pick them up. New submissions get the tags from the classifier,
 * which now knows the criteria.
 *
 * Matches by title, not slug, because the slug hash differs per environment (dev seed vs staging
 * vs prod) while the titles are stable. Idempotent: a config that already has a tag keeps one copy.
 * Dry run by default; --write persists. Point DATABASE_URL at the target env (staging first, then
 * production), like the other backfills.
 *
 *   bun run scripts/tag-weather-markets.ts          # dry run: print what would change
 *   bun run scripts/tag-weather-markets.ts --write  # persist
 */

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

/** Which curated tags each qualifying config's title should carry. */
const ASSIGNMENTS: Record<string, string[]> = {
  'Weather & Bitcoin Bar': ['weather', 'markets'],
}

/** Add the assigned tags to the matching published configs and recompute allTags.
 * Returns the slugs actually changed (already-tagged configs are skipped). No-op in dry runs. */
export async function tagWeatherMarkets(db: Db, write: boolean): Promise<string[]> {
  const titles = Object.keys(ASSIGNMENTS)
  const rows = await db
    .select({ config: schema.configs, version: schema.configVersions })
    .from(schema.configs)
    .innerJoin(schema.configVersions, eq(schema.configVersions.id, schema.configs.currentVersionId))
    .where(inArray(schema.configs.title, titles))

  const changed: string[] = []
  for (const { config, version } of rows) {
    if (config.status !== 'published') continue
    const curated = config.tags ?? []
    const additions = (ASSIGNMENTS[config.title] ?? []).filter((t) => !curated.includes(t))
    if (additions.length === 0) continue
    const tags = [...curated, ...additions]
    const allTags = computeAllTags({
      curatedTags: tags,
      interpreter: version.interpreter,
      networkHosts: version.networkHosts ?? [],
      readsClaudeToken: version.readsClaudeToken ?? false,
    })
    if (write) {
      await db.update(schema.configs).set({ tags, allTags }).where(eq(schema.configs.id, config.id))
    }
    changed.push(`${config.slug}  →  +${additions.join(',')}`)
  }
  return changed
}

async function main(): Promise<void> {
  const write = process.argv.includes('--write')
  const url = requireEnv('DATABASE_URL')
  const client = postgres(url, isPooledUrl(url) ? { prepare: false } : {})
  const db = drizzle({ client, schema }) as unknown as Db
  try {
    const changed = await tagWeatherMarkets(db, write)
    if (changed.length === 0) {
      console.log('[tag-weather-markets] nothing to do — every match already has its tags')
      return
    }
    for (const line of changed) console.log(`${line}${write ? '  (written)' : ''}`)
    if (!write) console.log('\n[tag-weather-markets] dry run — re-run with --write to persist')
  } finally {
    await client.end()
  }
}

if (import.meta.main) {
  main().then(
    () => process.exit(0),
    (err) => {
      console.error(`[tag-weather-markets] ${err instanceof Error ? err.message : err}`)
      process.exit(1)
    },
  )
}
