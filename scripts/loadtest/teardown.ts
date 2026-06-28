import { eq, inArray, like } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { configs, configVersions, previews, user } from '@/db/schema'
import { assertNotProduction } from '@/lib/env'
import { LOADTEST_AUTHORS, LOADTEST_SLUG_PREFIX } from './seed'

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

export interface LoadTeardownSummary {
  configs: number
  previews: number
  authors: number
}

/**
 * Removes everything `seed.ts` created and nothing else. Scoped to `loadtest-*` slugs + the
 * synthetic `LOADTEST_AUTHORS`, so curated data is never touched. Deleting the configs cascades to
 * their versions / votes / copy_events / render_jobs (FK `onDelete: cascade`), but `previews` has
 * no FK to configs — it's keyed by the script's content hash — so those rows are deleted
 * explicitly by sha first (collected before the cascade removes the versions that carry them).
 * Idempotent: running it with no load-test data present deletes nothing and returns zeros.
 */
export async function teardownLoadConfigs(db: Db): Promise<LoadTeardownSummary> {
  const slugPattern = `${LOADTEST_SLUG_PREFIX}%`

  // Collect the load-test previews' shas BEFORE deleting the configs (the cascade removes the
  // versions that carry contentSha256). Load-test shas embed the slug, so they never collide with
  // a curated config's preview.
  const verRows = await db
    .select({ sha: configVersions.contentSha256 })
    .from(configVersions)
    .innerJoin(configs, eq(configs.id, configVersions.configId))
    .where(like(configs.slug, slugPattern))
  const shas = [...new Set(verRows.map((r) => r.sha))]

  let previewsDeleted = 0
  if (shas.length > 0) {
    const del = await db
      .delete(previews)
      .where(inArray(previews.scriptSha, shas))
      .returning({ id: previews.id })
    previewsDeleted = del.length
  }

  const cfgDel = await db
    .delete(configs)
    .where(like(configs.slug, slugPattern))
    .returning({ id: configs.id })

  const authorDel = await db
    .delete(user)
    .where(
      inArray(
        user.id,
        LOADTEST_AUTHORS.map((a) => a.id),
      ),
    )
    .returning({ id: user.id })

  return { configs: cfgDel.length, previews: previewsDeleted, authors: authorDel.length }
}

// CLI entry. Behind import.meta.main so importing this module (e.g. from the test) never opens a
// Postgres connection — the real `@/db` is imported lazily only when run directly.
if (import.meta.main) {
  assertNotProduction('loadtest teardown')
  const { db } = await import('@/db')
  console.log('[loadtest teardown] removing all loadtest-* data from DATABASE_URL…')
  const summary = await teardownLoadConfigs(db)
  console.log(
    `[loadtest teardown] done — configs=${summary.configs} previews=${summary.previews} authors=${summary.authors}`,
  )
  process.exit(0)
}
