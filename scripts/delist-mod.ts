import { and, eq } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { isPooledUrl } from '@/db/is-pooled'
import * as schema from '@/db/schema'
import { requireEnv } from '@/lib/env'
import { confirmationGuards, guardLine } from '@/mods/publish'

/**
 * Delist a published mod (status 'published' → 'removed'), or restore one with `--restore`. The
 * marketplace lists only published mods, and it sets `forceRemoveDeletedPlugins`, so delisting
 * uninstalls the mod for every subscriber at their next session start after their copy of the
 * marketplace refreshes. That is why delisting needs the slug typed back; restoring does not.
 * Restoring re-lists the mod but does not reinstall it for anyone.
 *
 * AGENT USAGE — when asked to remove a mod (an author's request, or a takedown):
 *
 *   fly ssh console --app statuslines --command "bun run scripts/delist-mod.ts <slug> --confirm=<slug>"
 *   fly ssh console --app statuslines --command "bun run scripts/delist-mod.ts <slug> --restore"
 *
 *   # Or from your machine against any env:
 *   DATABASE_URL=<env-url> bun run scripts/delist-mod.ts <slug> [--confirm=<slug> | --restore]
 *
 * The <slug> is the last path segment of statuslin.es/mods/<slug>. Exit code 0 on success, 1 on a
 * missing confirmation or any error (slug not found, or mod not in the expected state).
 */

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

export interface DelistDeps {
  db: Db
  log: (line: string) => void
}

const USAGE = `Usage: bun run scripts/delist-mod.ts <slug> [--confirm=<slug> | --restore]
  --confirm=<slug>   delist a published mod (published → removed); uninstalls it for subscribers
  --restore          put a removed mod back (removed → published)`

async function transitionStatus(
  db: Db,
  slug: string,
  from: schema.ModStatus,
  to: schema.ModStatus,
): Promise<void> {
  const [row] = await db
    .select({ status: schema.mods.status })
    .from(schema.mods)
    .where(eq(schema.mods.slug, slug))
  if (!row) throw new Error(`no mod found with slug "${slug}"`)
  if (row.status !== from) {
    throw new Error(`mod "${slug}" is ${row.status}, not ${from} — nothing changed`)
  }
  await db
    .update(schema.mods)
    .set({ status: to })
    .where(and(eq(schema.mods.slug, slug), eq(schema.mods.status, from)))
}

export async function runDelist(argv: string[], { db, log }: DelistDeps): Promise<number> {
  const slug = argv.find((a) => !a.startsWith('--'))
  if (!slug) {
    log(USAGE)
    return 1
  }

  if (argv.includes('--restore')) {
    await transitionStatus(db, slug, 'removed', 'published')
    log(`[delist-mod] "${slug}": removed → published`)
    return 0
  }

  const confirmArg = argv.find((a) => a.startsWith('--confirm='))
  const refusals = confirmationGuards(slug, confirmArg?.slice('--confirm='.length) ?? null)
  if (refusals.length > 0) {
    log(`delisting "${slug}" will uninstall it for every subscriber at their next session start.`)
    for (const g of refusals) log(guardLine(g))
    return 1
  }
  await transitionStatus(db, slug, 'published', 'removed')
  log(`[delist-mod] "${slug}": published → removed`)
  return 0
}

async function main(): Promise<number> {
  const url = requireEnv('DATABASE_URL')
  const client = postgres(url, isPooledUrl(url) ? { prepare: false } : {})
  const db = drizzle({ client, schema }) as unknown as Db
  try {
    return await runDelist(process.argv.slice(2), { db, log: (line) => console.log(line) })
  } finally {
    await client.end()
  }
}

if (import.meta.main) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      console.error(`[delist-mod] ${err instanceof Error ? err.message : err}`)
      process.exit(1)
    },
  )
}
