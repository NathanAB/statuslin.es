import { readFileSync } from 'node:fs'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { isPooledUrl } from '@/db/is-pooled'
import * as schema from '@/db/schema'
import { requireEnv } from '@/lib/env'
import { CURATION_FILE, parseCuration } from '@/mods/curation'
import { runShowUnreviewed } from '@/mods/show-unreviewed'
import { terminalLine } from '@/mods/terminal-line'

/**
 * Show curated Desktop theme drafts as unreviewed mods (ADR 0014): a page at
 * /mods/unreviewed/<owner>/<plugin name> and theme cards in /themes' "Not reviewed" section, with
 * their recorded previews and nothing to install. The mod stays a draft; publish-mod.ts later
 * makes it a listing and ends the page.
 *
 * It refuses, per slug, a mod that is not a draft, one a user submitted, one whose live commit is
 * not its entry's in src/mods/curation.json, one with no Desktop theme or any theme not yet
 * recorded, a folder statuslin.es removed or rejected a submission of, and an address another
 * unreviewed mod already has. `--hide` takes a page down (a removal request).
 *
 * AGENT USAGE — a dry run by default; staging first, look at each page, then production:
 *
 *   bun run with-env staging scripts/show-unreviewed-mod.ts <slug>... [--apply]
 *   fly ssh console --app statuslines --command "bun run scripts/show-unreviewed-mod.ts <slug>... [--apply]"
 *   bun run show:unreviewed-mods <slug>... --hide [--apply]
 *
 * The <slug> is the mod's slug (its marketplace name), which the page's address never shows. Exit
 * code 0 when every slug was shown, hidden or unchanged, 1 on any refusal or error.
 */

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

async function main(): Promise<number> {
  const curation = parseCuration(JSON.parse(readFileSync(CURATION_FILE, 'utf8')))
  if (!curation.ok) throw new Error(`fix ${CURATION_FILE} first: ${curation.errors.join('; ')}`)
  const url = requireEnv('DATABASE_URL')
  const client = postgres(url, isPooledUrl(url) ? { prepare: false } : {})
  const db = drizzle({ client, schema }) as unknown as Db
  try {
    return await runShowUnreviewed(process.argv.slice(2), {
      db,
      curation: curation.entries,
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
        terminalLine(`[show-unreviewed-mod] ${err instanceof Error ? err.message : err}`),
      )
      process.exit(1)
    },
  )
}
