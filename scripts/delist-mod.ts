import { and, eq } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { isPooledUrl } from '@/db/is-pooled'
import * as schema from '@/db/schema'
import { requireEnv } from '@/lib/env'
import { createGitHub, type GitHub } from '@/mods/github'
import {
  confirmationGuards,
  guardLine,
  listingGuards,
  loadCurrentVersion,
  refuses,
  sourceLabel,
} from '@/mods/publish'
import { terminalLine } from '@/mods/terminal-line'

/**
 * Delist a published mod (status 'published' → 'removed'), or restore one with `--restore`. The
 * marketplace lists only published mods, and it sets `forceRemoveDeletedPlugins`, so delisting
 * uninstalls the mod for every subscriber at their next session start after their copy of the
 * marketplace refreshes. That is why delisting needs the slug typed back.
 *
 * Restoring re-lists the mod at its current version, so it needs the slug typed back too, and it runs
 * publish's listing refusals on that version: it must have rendered and still be on the repo's
 * default branch. Restoring does not reinstall the mod for anyone.
 *
 * AGENT USAGE — when asked to remove a mod (an author's request, or a takedown):
 *
 *   fly ssh console --app statuslines --command "bun run scripts/delist-mod.ts <slug> --confirm=<slug>"
 *   fly ssh console --app statuslines --command "bun run scripts/delist-mod.ts <slug> --restore --confirm=<slug>"
 *
 *   # Or from your machine against any env:
 *   DATABASE_URL=<env-url> bun run scripts/delist-mod.ts <slug> [--restore] --confirm=<slug>
 *
 * The <slug> is the last path segment of statuslin.es/mods/<slug>. Exit code 0 on success, 1 on a
 * missing confirmation or any error (slug not found, or mod not in the expected state).
 */

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

export interface DelistDeps {
  db: Db
  github: GitHub
  log: (line: string) => void
}

const USAGE = `Usage: bun run scripts/delist-mod.ts <slug> [--restore] --confirm=<slug>
  --confirm=<slug>   delist a published mod (published → removed); uninstalls it for subscribers
  --restore          with --confirm, put a removed mod back (removed → published) at its current version`

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

async function restore(
  slug: string,
  argv: string[],
  { db, github, log }: DelistDeps,
): Promise<number> {
  const [mod] = await db
    .select({
      id: schema.mods.id,
      status: schema.mods.status,
      currentVersionId: schema.mods.currentVersionId,
    })
    .from(schema.mods)
    .where(eq(schema.mods.slug, slug))
  if (!mod) throw new Error(`no mod found with slug "${slug}"`)
  if (mod.status !== 'removed') {
    throw new Error(`mod "${slug}" is ${mod.status}, not removed — nothing changed`)
  }
  const current = await loadCurrentVersion(db, mod)
  if (!current) throw new Error(`mod "${slug}" has no current version to restore`)

  log(`restoring "${slug}" at ${sourceLabel(current)} ${current.commitSha}`)
  const onDefaultBranch = await github.commitIsOnDefaultBranch(current.repoUrl, current.commitSha)
  const guards = [
    ...listingGuards({ target: current, onDefaultBranch }),
    ...confirmationGuards(slug, argv),
  ]
  for (const g of guards) log(guardLine(g))
  if (refuses(guards)) return 1

  await transitionStatus(db, slug, 'removed', 'published')
  log(`"${slug}": removed → published`)
  return 0
}

export async function runDelist(argv: string[], deps: DelistDeps): Promise<number> {
  const { db } = deps
  const log = (line: string) => deps.log(terminalLine(line))
  const slug = argv.find((a) => !a.startsWith('--'))
  if (!slug) {
    for (const line of USAGE.split('\n')) log(line)
    return 1
  }
  if (argv.includes('--restore')) return restore(slug, argv, { ...deps, log })

  const refusals = confirmationGuards(slug, argv)
  if (refusals.length > 0) {
    log(`delisting "${slug}" will uninstall it for every subscriber at their next session start.`)
    for (const g of refusals) log(guardLine(g))
    return 1
  }
  await transitionStatus(db, slug, 'published', 'removed')
  log(`"${slug}": published → removed`)
  return 0
}

async function main(): Promise<number> {
  const url = requireEnv('DATABASE_URL')
  const client = postgres(url, isPooledUrl(url) ? { prepare: false } : {})
  const db = drizzle({ client, schema }) as unknown as Db
  try {
    return await runDelist(process.argv.slice(2), {
      db,
      github: createGitHub(),
      log: (line) => console.log(line),
    })
  } finally {
    await client.end()
  }
}

if (import.meta.main) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      console.error(terminalLine(`[delist-mod] ${err instanceof Error ? err.message : err}`))
      process.exit(1)
    },
  )
}
