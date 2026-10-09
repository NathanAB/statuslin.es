import { asc, eq } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { isPooledUrl } from '@/db/is-pooled'
import * as schema from '@/db/schema'
import { requireEnv } from '@/lib/env'
import { createGitHub, type GitHub } from '@/mods/github'

/**
 * Confirm that every published mod's current commit can still be fetched from GitHub. Claude Code
 * installs a mod from the commit /marketplace.json pins, so a force-pushed-away or deleted commit
 * breaks every new install. This lists each published mod whose commit can't be fetched and exits
 * non-zero when any can't, so it can run on a schedule later. A GitHub error (rate limit, outage)
 * aborts the run instead of reporting a commit as gone.
 *
 * AGENT USAGE — run by hand:
 *
 *   fly ssh console --app statuslines --command "bun run scripts/check-mods.ts"
 *
 *   # Or from your machine against any env:
 *   DATABASE_URL=<env-url> bun run scripts/check-mods.ts
 *
 * For each listed mod, re-pin it to a fetchable commit with publish-mod.ts, or delist it with
 * delist-mod.ts. Exit code 0 when every commit is fetchable, 1 otherwise.
 */

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

export interface CheckDeps {
  db: Db
  github: GitHub
  log: (line: string) => void
}

export async function runCheck({ db, github, log }: CheckDeps): Promise<number> {
  const pins = await db
    .select({
      slug: schema.mods.slug,
      repoUrl: schema.modVersions.repoUrl,
      commitSha: schema.modVersions.commitSha,
    })
    .from(schema.mods)
    .innerJoin(schema.modVersions, eq(schema.modVersions.id, schema.mods.currentVersionId))
    .where(eq(schema.mods.status, 'published'))
    .orderBy(asc(schema.mods.slug))

  const unfetchable: typeof pins = []
  for (const pin of pins) {
    if (!(await github.commitIsFetchable(pin.repoUrl, pin.commitSha))) unfetchable.push(pin)
  }

  if (unfetchable.length === 0) {
    log(`all ${pins.length} published mod commits can be fetched`)
    return 0
  }
  log(`${unfetchable.length} of ${pins.length} published mod commits can't be fetched:`)
  for (const pin of unfetchable) log(`  ${pin.slug} ${pin.repoUrl} ${pin.commitSha}`)
  return 1
}

async function main(): Promise<number> {
  const url = requireEnv('DATABASE_URL')
  const client = postgres(url, isPooledUrl(url) ? { prepare: false } : {})
  const db = drizzle({ client, schema }) as unknown as Db
  try {
    return await runCheck({ db, github: createGitHub(), log: (line) => console.log(line) })
  } finally {
    await client.end()
  }
}

if (import.meta.main) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      console.error(`[check-mods] ${err instanceof Error ? err.message : err}`)
      process.exit(1)
    },
  )
}
