import { and, eq } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { isPooledUrl } from '@/db/is-pooled'
import * as schema from '@/db/schema'
import { requireEnv } from '@/lib/env'

/**
 * Take a published config down from the gallery, or restore one. Because every public read path
 * filters `status = 'published'` (gallery list, page count, and getConfigBySlug for the detail page),
 * flipping a config's status to 'removed' makes it vanish everywhere at once — and flipping it back
 * to 'published' restores it. `status` is free text, so no migration is involved. The change is fully
 * reversible, which is why `--restore` exists: an accidental takedown is undone without hand-SQL.
 *
 * A takedown is permanent today: the submit flow (src/submit/submit.ts) always creates a *new* config
 * with a new slug, so a removed config can never gain a new version — nothing re-publishes it except
 * `--restore`. Caveat for the future: `approveVersion` (src/review/decide.ts) sets status='published'
 * unconditionally, so IF an edit-existing-config flow is ever added, guard that approve path or
 * approving an update would silently undo a takedown.
 *
 * AGENT USAGE — this is the emergency takedown tool. When asked to "take down" / "pull" / "remove" a
 * live config, run it against the right environment's DB:
 *
 *   # Production (runs inside the prod machine where DATABASE_URL is already set — no creds locally):
 *   fly ssh console --app statuslines --command "bun run scripts/remove-config.ts <slug>"
 *   fly ssh console --app statuslines --command "bun run scripts/remove-config.ts <slug> --restore"
 *
 *   # Or against any env from your machine by exporting its DB URL first:
 *   DATABASE_URL=<env-url> bun run scripts/remove-config.ts <slug> [--restore]
 *
 * The <slug> is the last path segment of the config's URL: statuslin.es/c/<slug>.
 * Exit code 0 on success, 1 on any error (slug not found, or config not in the expected state).
 */

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

export type StatusChange = { slug: string; previousStatus: string }

/** Move a config from one status to another by slug, erroring clearly if it isn't in `from`. */
async function transitionStatus(
  db: Db,
  slug: string,
  from: string,
  to: string,
): Promise<StatusChange> {
  const [row] = await db
    .select({ status: schema.configs.status })
    .from(schema.configs)
    .where(eq(schema.configs.slug, slug))
  if (!row) throw new Error(`no config found with slug "${slug}"`)
  if (row.status !== from) {
    throw new Error(`config "${slug}" is ${row.status}, not ${from} — nothing changed`)
  }
  await db
    .update(schema.configs)
    .set({ status: to })
    .where(and(eq(schema.configs.slug, slug), eq(schema.configs.status, from)))
  return { slug, previousStatus: from }
}

/** Take a published config down: status 'published' → 'removed'. */
export function removeConfig(db: Db, slug: string): Promise<StatusChange> {
  return transitionStatus(db, slug, 'published', 'removed')
}

/** Restore a removed config: status 'removed' → 'published'. */
export function restoreConfig(db: Db, slug: string): Promise<StatusChange> {
  return transitionStatus(db, slug, 'removed', 'published')
}

const USAGE = `Usage: bun run scripts/remove-config.ts <slug> [--restore]
  default     take a published config down from the gallery (published → removed)
  --restore   put a removed config back (removed → published)`

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const restore = args.includes('--restore')
  const slug = args.find((a) => !a.startsWith('--'))
  if (!slug) {
    console.error(USAGE)
    process.exit(1)
  }

  const url = requireEnv('DATABASE_URL')
  const client = postgres(url, isPooledUrl(url) ? { prepare: false } : {})
  const db = drizzle({ client, schema }) as unknown as Db
  try {
    const { previousStatus } = restore
      ? await restoreConfig(db, slug)
      : await removeConfig(db, slug)
    const to = restore ? 'published' : 'removed'
    console.log(`[remove-config] "${slug}": ${previousStatus} → ${to}`)
  } finally {
    await client.end()
  }
}

if (import.meta.main) {
  main().then(
    () => process.exit(0),
    (err) => {
      console.error(`[remove-config] ${err instanceof Error ? err.message : err}`)
      process.exit(1)
    },
  )
}
