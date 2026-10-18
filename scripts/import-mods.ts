import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { and, eq, not } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { isPooledUrl } from '@/db/is-pooled'
import * as schema from '@/db/schema'
import { requireEnv } from '@/lib/env'
import { CURATION_FILE, type CurationEntry, parseCuration } from '@/mods/curation'
import { createGitHub, type GitHubSource } from '@/mods/github'
import {
  hasSubmission,
  importedSlug,
  insertDraftMod,
  insertNextVersion,
  inspectSource,
  pickSlug,
} from '@/mods/import'
import { terminalLine } from '@/mods/terminal-line'
import { withModSandbox } from '@/render/mods/mod-sandbox'

/**
 * Import the curated mods as drafts. For each entry in the curation file it downloads the
 * repository at the pinned commit, unpacks it in an offline E2B sandbox, runs that sandbox's
 * `claude plugin validate --json` for the footprint, reads plugin.json, and writes a draft mod with
 * its first version, one transaction per mod. Publishing is separate (scripts/publish-mod.ts).
 *
 * An entry re-pinned to a new commit of an existing mod (same plugin name and repository) adds that
 * commit as the mod's next version and changes nothing else: the current version stays live until
 * publish-mod.ts makes the new one current, after render:mods has rendered it. A plugin name that
 * another mod already uses, from another repository, makes a new mod. A mod's slug is its
 * marketplace entry name: the plugin's own name, or `<name>-<owner>` when another mod has that
 * (ADR 0005).
 *
 * Idempotent: an entry whose repository, path and commit are already imported is skipped without a
 * request, so rerunning the same file changes nothing. The whole file's format is checked before
 * anything is fetched or written; an entry refused later is reported and the others still import.
 *
 * AGENT USAGE (needs E2B_API_KEY and DATABASE_URL):
 *
 *   bun run import:mods [curation-file]      # default src/mods/curation.json
 *
 * Exit code 0 when every entry imported or was already there, 1 when any was refused.
 */

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

export interface ImportDeps {
  db: Db
  github: Pick<GitHubSource, 'repoInfo' | 'tarball'>
  withSandbox: typeof withModSandbox
  log: (line: string) => void
}

/**
 * The curated mod an entry re-pins: the one with its plugin name whose current version is from its
 * repository. A mod a user submitted is theirs to update (ADR 0005), so it is never re-pinned here.
 */
async function modToRepin(
  db: Db,
  entry: CurationEntry,
): Promise<{ id: string; slug: string } | undefined> {
  const rows = await db
    .select({ id: schema.mods.id, slug: schema.mods.slug })
    .from(schema.mods)
    .innerJoin(schema.modVersions, eq(schema.modVersions.id, schema.mods.currentVersionId))
    .where(
      and(
        eq(schema.mods.pluginName, entry.pluginName),
        eq(schema.modVersions.repoUrl, entry.repoUrl),
        not(hasSubmission(db)),
      ),
    )
  if (rows.length > 1) {
    throw new Error(
      `${rows.length} curated mods are "${entry.pluginName}" from ${entry.repoUrl}: ${rows.map((r) => r.slug).join(', ')}`,
    )
  }
  return rows[0]
}

async function importEntry(
  entry: CurationEntry,
  { db, github, withSandbox }: ImportDeps,
): Promise<string> {
  const name = entry.pluginName
  const imported = await importedSlug(db, entry)
  if (imported) return `unchanged ${imported}: already imported at ${entry.commitSha}`
  const existing = await modToRepin(db, entry)

  const repo = await github.repoInfo(entry.repoUrl)
  const canonical = `https://github.com/${repo.fullName}`
  if (canonical !== entry.repoUrl) throw new Error(`write the repository URL as ${canonical}`)
  const owner = repo.fullName.slice(0, repo.fullName.indexOf('/'))
  const slug = existing?.slug ?? (await pickSlug(db, name, owner))
  const facts = await inspectSource(entry, { github, withSandbox })
  if (facts.manifest.name !== name) {
    throw new Error(`plugin.json names the plugin "${facts.manifest.name}", not "${name}"`)
  }

  const versionId = randomUUID()
  const versionNumber = await db.transaction(async (tx) => {
    const modId = existing?.id ?? randomUUID()
    if (!existing) {
      await insertDraftMod(tx, { modId, slug, title: entry.title, owner, facts, versionId })
    }
    return insertNextVersion(tx, {
      modId,
      versionId,
      source: entry,
      facts,
      license: repo.license,
      inputSteps: entry.inputSteps,
    })
  })
  const { events, calls } = facts.footprint
  return `imported ${slug} v${versionNumber} at ${entry.commitSha}: plugin ${facts.manifest.version ?? 'unversioned'}, license ${repo.license ?? 'none'}, ${events.length} events, ${calls.length} calls`
}

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error))

export async function importMods(raw: unknown, deps: ImportDeps): Promise<number> {
  const log = (line: string) => deps.log(terminalLine(line))
  const curation = parseCuration(raw)
  if (!curation.ok) {
    for (const error of curation.errors) log(`refused ${error}`)
    log('nothing imported: fix the curation file first')
    return 1
  }

  let refused = 0
  for (const entry of curation.entries) {
    try {
      log(await importEntry(entry, deps))
    } catch (error) {
      refused++
      log(`refused ${entry.pluginName}: ${messageOf(error)}`)
    }
  }
  return refused === 0 ? 0 : 1
}

async function main(): Promise<number> {
  const file = process.argv[2] ?? CURATION_FILE
  const url = requireEnv('DATABASE_URL')
  const client = postgres(url, isPooledUrl(url) ? { prepare: false } : {})
  const db = drizzle({ client, schema }) as unknown as Db
  try {
    return await importMods(JSON.parse(readFileSync(file, 'utf8')), {
      db,
      github: createGitHub(),
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
      console.error(terminalLine(`[import-mods] ${messageOf(err)}`))
      process.exit(1)
    },
  )
}
