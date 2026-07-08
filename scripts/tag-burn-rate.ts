import { eq, inArray } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { isPooledUrl } from '@/db/is-pooled'
import * as schema from '@/db/schema'
import { computeAllTags } from '@/lib/derived-tags'
import { requireEnv } from '@/lib/env'

/**
 * One-time backfill: add the `burn-rate` curated tag to the published configs that show usage
 * pace / burn rate, then recompute their allTags. The tag was added to the registry after these
 * configs were already classified, and the model classifier (scripts/backfill-tags.ts) only
 * (re)tags configs whose tags are still empty — so this targeted pass is how the existing five
 * pick it up. New submissions get `burn-rate` from the classifier, which now knows the criterion.
 *
 * Matches by title, not slug, because the slug hash differs per environment (dev seed vs staging
 * vs prod) while the titles are stable. Idempotent: a config that already has `burn-rate` is left
 * alone. Dry run by default; --write persists. Point DATABASE_URL at the target env (staging
 * first, then prod), like the other backfills.
 *
 *   bun run scripts/tag-burn-rate.ts          # dry run: print what would change
 *   bun run scripts/tag-burn-rate.ts --write  # persist
 */

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

const BURN_RATE = 'burn-rate'

/** The published configs that show usage pace or burn rate, by title (stable across environments). */
export const BURN_RATE_TITLES = [
  'Activity Feed',
  'Burn Rate Bars',
  'Pace Arrows',
  'Pace Dot Meters',
  'Width-Aware Monitor',
]

/** Add `burn-rate` to the curated tags of the matching published configs and recompute allTags.
 * Returns the slugs actually changed (already-tagged configs are skipped). No-op in dry runs. */
export async function tagBurnRate(db: Db, write: boolean): Promise<string[]> {
  const rows = await db
    .select({ config: schema.configs, version: schema.configVersions })
    .from(schema.configs)
    .innerJoin(schema.configVersions, eq(schema.configVersions.id, schema.configs.currentVersionId))
    .where(inArray(schema.configs.title, BURN_RATE_TITLES))

  const changed: string[] = []
  for (const { config, version } of rows) {
    if (config.status !== 'published') continue
    const curated = config.tags ?? []
    if (curated.includes(BURN_RATE)) continue
    const tags = [...curated, BURN_RATE]
    const allTags = computeAllTags({
      curatedTags: tags,
      interpreter: version.interpreter,
      networkHosts: version.networkHosts ?? [],
      readsClaudeToken: version.readsClaudeToken ?? false,
    })
    if (write) {
      await db.update(schema.configs).set({ tags, allTags }).where(eq(schema.configs.id, config.id))
    }
    changed.push(config.slug)
  }
  return changed
}

async function main(): Promise<void> {
  const write = process.argv.includes('--write')
  const url = requireEnv('DATABASE_URL')
  const client = postgres(url, isPooledUrl(url) ? { prepare: false } : {})
  const db = drizzle({ client, schema }) as unknown as Db
  try {
    const changed = await tagBurnRate(db, write)
    if (changed.length === 0) {
      console.log('[tag-burn-rate] nothing to do — every match already has burn-rate')
      return
    }
    for (const slug of changed) console.log(`${slug}  →  +burn-rate${write ? '  (written)' : ''}`)
    if (!write) console.log('\n[tag-burn-rate] dry run — re-run with --write to persist')
  } finally {
    await client.end()
  }
}

if (import.meta.main) {
  main().then(
    () => process.exit(0),
    (err) => {
      console.error(`[tag-burn-rate] ${err instanceof Error ? err.message : err}`)
      process.exit(1)
    },
  )
}
