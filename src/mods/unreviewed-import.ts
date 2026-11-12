import { and, eq, notInArray, sql } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import * as schema from '@/db/schema'
import type { withModSandbox } from '@/render/mods/mod-sandbox'
import type { GitHubSource } from './github'
import { type FetchPlugin, inspectSource } from './import'
import { terminalLine } from './terminal-line'
import { parseUnreviewed, UNREVIEWED_FILE, type UnreviewedEntry } from './unreviewed'

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

export interface UnreviewedImportDeps {
  db: Db
  github: Pick<GitHubSource, 'findRepo' | 'commitDate'>
  fetchPlugin: FetchPlugin
  withSandbox: typeof withModSandbox
  log: (line: string) => void
}

const { unreviewedMods } = schema

/** Why statuslin.es said no to this plugin folder before; a refused mod never gets a page (ADR 0011). */
async function refusedBefore(db: Db, entry: UnreviewedEntry): Promise<string | null> {
  const rows = await db
    .select({ modStatus: schema.mods.status, submissionStatus: schema.submissions.status })
    .from(schema.modVersions)
    .innerJoin(schema.mods, eq(schema.mods.id, schema.modVersions.modId))
    .leftJoin(schema.submissions, eq(schema.submissions.modVersionId, schema.modVersions.id))
    .where(
      and(eq(schema.modVersions.repoUrl, entry.repoUrl), eq(schema.modVersions.path, entry.path)),
    )
  if (rows.some((row) => row.modStatus === 'removed')) return 'statuslin.es removed this mod'
  if (rows.some((row) => row.submissionStatus === 'rejected')) {
    return 'statuslin.es rejected a submission of this mod'
  }
  return null
}

/** The row already made from exactly this entry. */
async function unchangedRow(db: Db, entry: UnreviewedEntry) {
  const [row] = await db
    .select({ id: unreviewedMods.id, owner: unreviewedMods.owner })
    .from(unreviewedMods)
    .where(
      and(
        eq(unreviewedMods.repoUrl, entry.repoUrl),
        eq(unreviewedMods.path, entry.path),
        eq(unreviewedMods.commitSha, entry.commitSha),
        eq(unreviewedMods.pluginName, entry.pluginName),
      ),
    )
  return row
}

/** Reads the entry from GitHub and the sandbox and writes its row; returns the row's id. */
async function importEntry(
  entry: UnreviewedEntry,
  { db, github, fetchPlugin, withSandbox }: UnreviewedImportDeps,
): Promise<{ id: string; line: string }> {
  const refusal = await refusedBefore(db, entry)
  if (refusal) throw new Error(refusal)
  const existing = await unchangedRow(db, entry)
  if (existing) {
    return {
      id: existing.id,
      line: `unchanged ${existing.owner}/${entry.pluginName} at ${entry.commitSha}`,
    }
  }

  const repo = await github.findRepo(entry.repoUrl)
  if (!repo) {
    throw new Error(`GitHub does not serve ${entry.repoUrl}; a private repository gets no page`)
  }
  const canonical = `https://github.com/${repo.fullName}`
  if (canonical !== entry.repoUrl) throw new Error(`write the repository URL as ${canonical}`)
  const owner = repo.fullName.slice(0, repo.fullName.indexOf('/'))
  const facts = await inspectSource(entry, { fetchPlugin, withSandbox })
  if (facts.manifest.name !== entry.pluginName) {
    throw new Error(
      `plugin.json names the plugin "${facts.manifest.name}", not "${entry.pluginName}"`,
    )
  }
  const committedAt = await github.commitDate(entry.repoUrl, entry.commitSha)

  const id = await db.transaction(async (tx) => {
    // The same page at an older commit.
    await tx
      .delete(unreviewedMods)
      .where(
        and(
          sql`lower(${unreviewedMods.owner}) = lower(${owner})`,
          eq(unreviewedMods.pluginName, entry.pluginName),
        ),
      )
    const [row] = await tx
      .insert(unreviewedMods)
      .values({
        owner,
        pluginName: entry.pluginName,
        description: facts.manifest.description,
        repoUrl: entry.repoUrl,
        path: entry.path,
        commitSha: entry.commitSha,
        committedAt,
        pluginVersion: facts.manifest.version,
        license: repo.license,
        stars: repo.stars,
        footprint: facts.footprint,
        validatedWith: facts.claudeCodeVersion,
      })
      .returning({ id: unreviewedMods.id })
    if (!row) throw new Error('the insert returned no row')
    return row.id
  })
  return { id, line: `imported ${owner}/${entry.pluginName} at ${entry.commitSha}` }
}

/** Deletes every row not made from an entry this run kept: that is how a removal is honoured. */
async function deleteOthers(db: Db, kept: string[]): Promise<string[]> {
  const deleted = await db
    .delete(unreviewedMods)
    .where(kept.length > 0 ? notInArray(unreviewedMods.id, kept) : undefined)
    .returning({ owner: unreviewedMods.owner, pluginName: unreviewedMods.pluginName })
  return deleted.map((row) => `deleted ${row.owner}/${row.pluginName}: its entry left the file`)
}

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error))

/**
 * Makes the unreviewed_mods table match the file (ADR 0011). Each entry is checked like a submitted
 * mod (its repository read from GitHub, its plugin inspected in an offline sandbox) and refused if
 * it fails, if its plugin.json names another plugin, if its repository is private, or if
 * statuslin.es removed or rejected that folder. A refused entry keeps no row. Idempotent: an
 * unchanged entry is skipped without a request. Returns 0 when every entry is in the table.
 */
export async function importUnreviewedMods(
  raw: unknown,
  deps: UnreviewedImportDeps,
): Promise<number> {
  const log = (line: string) => deps.log(terminalLine(line))
  const file = parseUnreviewed(raw)
  if (!file.ok) {
    for (const error of file.errors) log(`refused ${error}`)
    log(`nothing imported: fix ${UNREVIEWED_FILE} first`)
    return 1
  }

  const kept: string[] = []
  let refused = 0
  for (const entry of file.entries) {
    try {
      const { id, line } = await importEntry(entry, deps)
      kept.push(id)
      log(line)
    } catch (error) {
      refused++
      log(`refused ${entry.pluginName}: ${messageOf(error)}`)
    }
  }
  for (const line of await deleteOthers(deps.db, kept)) log(line)
  return refused === 0 ? 0 : 1
}
