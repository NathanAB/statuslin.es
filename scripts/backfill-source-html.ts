import { eq, isNull } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { isPooledUrl } from '@/db/is-pooled'
import * as schema from '@/db/schema'
import { coerceInterpreter } from '@/gallery/queries'
import { requireEnv } from '@/lib/env'
import { tryHighlightSource } from '@/lib/highlight'

/**
 * One-time backfill of `config_versions.source_html` for versions created before highlight-at-submit
 * existed. Highlight is a pure function of (source, interpreter), both immutable on the row, so the
 * stored HTML never goes stale. Idempotent: only touches rows where source_html IS NULL, so it's
 * safe to run repeatedly and once per environment.
 *
 * Run (bun auto-loads .env for DATABASE_URL):
 *   bun run scripts/backfill-source-html.ts                          # current env (.env)
 *   DATABASE_URL=<staging-url> bun run scripts/backfill-source-html.ts   # a specific env
 */

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

export async function backfillSourceHtml(db: Db): Promise<{ scanned: number; updated: number }> {
  const rows = await db
    .select({
      id: schema.configVersions.id,
      source: schema.configVersions.source,
      interpreter: schema.configVersions.interpreter,
    })
    .from(schema.configVersions)
    .where(isNull(schema.configVersions.sourceHtml))
  let updated = 0
  for (const row of rows) {
    const html = await tryHighlightSource(row.source, coerceInterpreter(row.interpreter))
    if (html == null) continue // best-effort: leave null, the read path highlights live
    await db
      .update(schema.configVersions)
      .set({ sourceHtml: html })
      .where(eq(schema.configVersions.id, row.id))
    updated++
  }
  return { scanned: rows.length, updated }
}

async function main(): Promise<void> {
  const url = requireEnv('DATABASE_URL')
  const client = postgres(url, isPooledUrl(url) ? { prepare: false } : {})
  const db = drizzle({ client, schema }) as unknown as Db
  try {
    console.log('[backfill] scanning config_versions for missing source_html…')
    const { scanned, updated } = await backfillSourceHtml(db)
    console.log(`[backfill] highlighted ${updated} of ${scanned} version(s) missing source_html`)
  } finally {
    await client.end()
  }
}

if (import.meta.main) {
  main().then(
    () => process.exit(0),
    (err) => {
      console.error(err)
      process.exit(1)
    },
  )
}
