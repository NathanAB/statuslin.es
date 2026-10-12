import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { and, eq, max } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { isPooledUrl } from '@/db/is-pooled'
import * as schema from '@/db/schema'
import { requireEnv } from '@/lib/env'
import { CURATION_FILE, type CurationEntry, parseCuration } from '@/mods/curation'
import { createGitHub, type GitHubSource } from '@/mods/github'
import { inspectPlugin } from '@/mods/plugin-facts'
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

async function importedSlug(db: Db, entry: CurationEntry): Promise<string | undefined> {
  const [row] = await db
    .select({ slug: schema.mods.slug })
    .from(schema.modVersions)
    .innerJoin(schema.mods, eq(schema.mods.id, schema.modVersions.modId))
    .where(
      and(
        eq(schema.modVersions.repoUrl, entry.repoUrl),
        eq(schema.modVersions.path, entry.path),
        eq(schema.modVersions.commitSha, entry.commitSha),
      ),
    )
  return row?.slug
}

/** The mod an entry re-pins: the one with its plugin name whose current version is from its repository. */
async function modToRepin(
  db: Db,
  entry: CurationEntry,
): Promise<{ id: string; slug: string } | undefined> {
  const [row] = await db
    .select({ id: schema.mods.id, slug: schema.mods.slug })
    .from(schema.mods)
    .innerJoin(
      schema.modVersions,
      and(
        eq(schema.modVersions.id, schema.mods.currentVersionId),
        eq(schema.modVersions.modId, schema.mods.id),
      ),
    )
    .where(
      and(
        eq(schema.mods.pluginName, entry.pluginName),
        eq(schema.modVersions.repoUrl, entry.repoUrl),
      ),
    )
  return row
}

async function slugTaken(db: Db, slug: string): Promise<boolean> {
  const [row] = await db
    .select({ id: schema.mods.id })
    .from(schema.mods)
    .where(eq(schema.mods.slug, slug))
  return row !== undefined
}

/** The plugin's own name, or `<name>-<owner>` when another mod has it (ADR 0005). */
async function pickSlug(db: Db, name: string, owner: string): Promise<string> {
  if (!(await slugTaken(db, name))) return name
  const withOwner = `${name}-${owner}`
  if (!(await slugTaken(db, withOwner))) return withOwner
  throw new Error(`"${name}" and "${withOwner}" are both taken by other mods`)
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
  const facts = await withSandbox(
    { tarball: await github.tarball(entry.repoUrl, entry.commitSha), path: entry.path },
    inspectPlugin,
  )
  if (facts.manifest.name !== name) {
    throw new Error(`plugin.json names the plugin "${facts.manifest.name}", not "${name}"`)
  }

  const versionId = randomUUID()
  const versionNumber = await db.transaction(async (tx) => {
    const modId = existing?.id ?? randomUUID()
    if (!existing) {
      await tx.insert(schema.mods).values({
        id: modId,
        slug,
        pluginName: name,
        title: entry.title,
        description: facts.manifest.description,
        authorGithub: owner,
        status: 'draft',
        currentVersionId: versionId,
      })
    }
    const [latest] = await tx
      .select({ versionNumber: max(schema.modVersions.versionNumber) })
      .from(schema.modVersions)
      .where(eq(schema.modVersions.modId, modId))
    const next = (latest?.versionNumber ?? 0) + 1
    await tx.insert(schema.modVersions).values({
      id: versionId,
      modId,
      versionNumber: next,
      repoUrl: entry.repoUrl,
      path: entry.path,
      commitSha: entry.commitSha,
      pluginVersion: facts.manifest.version,
      license: repo.license,
      footprint: facts.footprint,
      validatedWith: facts.claudeCodeVersion,
      inputSteps: entry.inputSteps,
    })
    return next
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
