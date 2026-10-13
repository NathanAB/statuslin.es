import { and, eq } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { isPooledUrl } from '@/db/is-pooled'
import * as schema from '@/db/schema'
import { requireEnv } from '@/lib/env'
import { confirmationGuards, guardLine, refuses } from '@/mods/publish'
import { terminalLine } from '@/mods/terminal-line'

/**
 * Delete a mod that was never published: a submission that will not be approved, such as spam or
 * one its author abandoned, or a draft the operator imported by mistake. Its versions, previews and
 * submissions go with it (cascade); its submitter can then submit the folder afresh. A published or
 * removed mod is refused: its name has been in the marketplace, so it stays (use delist-mod.ts).
 *
 * AGENT USAGE — a dry run by default; nothing changes without `--confirm=<slug>`:
 *
 *   fly ssh console --app statuslines --command "bun run scripts/delete-mod-draft.ts <slug>"
 *   fly ssh console --app statuslines --command "bun run scripts/delete-mod-draft.ts <slug> --confirm=<slug>"
 *
 *   # Or from your machine against any env:
 *   DATABASE_URL=<env-url> bun run scripts/delete-mod-draft.ts <slug> [--confirm=<slug>]
 *
 * Exit code 0 on a clean dry run or a delete, 1 on a refusal or error.
 */

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

export interface DeleteDraftDeps {
  db: Db
  log: (line: string) => void
}

const USAGE = `Usage: bun run scripts/delete-mod-draft.ts <slug> [--confirm=<slug>]
  default            dry run: print the draft and what deleting it removes
  --confirm=<slug>   delete it`

export async function runDeleteDraft(argv: string[], { db, log: print }: DeleteDraftDeps) {
  const log = (line: string) => print(terminalLine(line))
  const [slug] = argv.filter((arg) => !arg.startsWith('--'))
  if (!slug) {
    for (const line of USAGE.split('\n')) log(line)
    return 1
  }
  const [mod] = await db
    .select({ id: schema.mods.id, status: schema.mods.status, title: schema.mods.title })
    .from(schema.mods)
    .where(eq(schema.mods.slug, slug))
  if (!mod) {
    log(`no mod found with slug "${slug}"`)
    return 1
  }
  if (mod.status !== 'draft') {
    log(`"${slug}" is ${mod.status}; only a draft can be deleted (delist a published mod instead)`)
    return 1
  }
  const versions = await db
    .select({ versionNumber: schema.modVersions.versionNumber, status: schema.submissions.status })
    .from(schema.modVersions)
    .leftJoin(schema.submissions, eq(schema.submissions.modVersionId, schema.modVersions.id))
    .where(eq(schema.modVersions.modId, mod.id))
    .orderBy(schema.modVersions.versionNumber)
  log(`draft "${slug}": ${mod.title}`)
  for (const v of versions) log(`  v${v.versionNumber}: ${v.status ?? 'curated, no submission'}`)
  const confirm = confirmationGuards(slug, argv)
  if (!argv.some((arg) => arg.startsWith('--confirm='))) {
    log(`dry run: nothing changed. Rerun with --confirm=${slug} to delete it.`)
    return 0
  }
  if (refuses(confirm)) {
    for (const guard of confirm) log(guardLine(guard))
    return 1
  }
  const deleted = await db
    .delete(schema.mods)
    .where(and(eq(schema.mods.id, mod.id), eq(schema.mods.status, 'draft')))
    .returning({ id: schema.mods.id })
  if (deleted.length === 0) {
    log(`"${slug}" changed while this ran; nothing deleted`)
    return 1
  }
  log(`deleted draft "${slug}" and its ${versions.length} version(s)`)
  return 0
}

async function main(): Promise<number> {
  const url = requireEnv('DATABASE_URL')
  const client = postgres(url, isPooledUrl(url) ? { prepare: false } : {})
  const db = drizzle({ client, schema }) as unknown as Db
  try {
    return await runDeleteDraft(process.argv.slice(2), { db, log: (line) => console.log(line) })
  } finally {
    await client.end()
  }
}

if (import.meta.main) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      console.error(terminalLine(`[delete-mod-draft] ${err instanceof Error ? err.message : err}`))
      process.exit(1)
    },
  )
}
