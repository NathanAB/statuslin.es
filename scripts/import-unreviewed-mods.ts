import { readFileSync } from 'node:fs'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { isPooledUrl } from '@/db/is-pooled'
import * as schema from '@/db/schema'
import { requireEnv } from '@/lib/env'
import { createGitHub } from '@/mods/github'
import { terminalLine } from '@/mods/terminal-line'
import { UNREVIEWED_FILE } from '@/mods/unreviewed'
import { importUnreviewedMods } from '@/mods/unreviewed-import'
import { withModSandbox } from '@/render/mods/mod-sandbox'
import { createPluginFetcher } from '@/render/mods/plugin-checkout'
import { assertReviewedOnMain, fileOnMain } from './reviewed-on-main'

/**
 * Make the unreviewed_mods table match src/mods/unreviewed.json (ADR 0011): import new and changed
 * entries, skip unchanged ones, delete rows whose entry left the file. Each new or changed entry is
 * read from GitHub and inspected in an offline E2B sandbox, as a submitted mod is. It refuses a file
 * that isn't the reviewed one on origin/main (merge, then git pull).
 *
 * AGENT USAGE (needs E2B_API_KEY and DATABASE_URL), in the operator's terminal for staging or prod:
 *
 *   bun run with-env staging scripts/import-unreviewed-mods.ts
 *
 * Exit code 0 when every entry is in the table, 1 when any was refused.
 */

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

async function main(): Promise<number> {
  const url = requireEnv('DATABASE_URL')
  requireEnv('E2B_API_KEY')
  const onDisk = readFileSync(UNREVIEWED_FILE, 'utf8')
  assertReviewedOnMain(UNREVIEWED_FILE, onDisk, fileOnMain(UNREVIEWED_FILE))
  const client = postgres(url, isPooledUrl(url) ? { prepare: false } : {})
  const db = drizzle({ client, schema }) as unknown as Db
  try {
    return await importUnreviewedMods(JSON.parse(onDisk), {
      db,
      github: createGitHub(),
      fetchPlugin: createPluginFetcher(),
      withSandbox: withModSandbox,
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
      console.error(
        terminalLine(`[import-unreviewed-mods] ${err instanceof Error ? err.message : err}`),
      )
      process.exit(1)
    },
  )
}
