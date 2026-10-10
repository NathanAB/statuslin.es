import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { and, eq, or } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { isPooledUrl } from '@/db/is-pooled'
import * as schema from '@/db/schema'
import { requireEnv } from '@/lib/env'
import { CURATION_FILE, type CurationEntry, parseCuration } from '@/mods/curation'
import { createGitHub, type GitHubSource } from '@/mods/github'
import { inspectPlugin } from '@/mods/plugin-facts'
import { printable } from '@/mods/publish'
import { withModSandbox } from '@/render/mods/mod-sandbox'

/**
 * Import the curated mods as drafts. For each entry in the curation file it downloads the
 * repository at the pinned commit, unpacks it in an offline E2B sandbox, runs that sandbox's
 * `claude plugin validate --json` for the footprint, reads plugin.json, and writes a draft mod with
 * its first version, one transaction per mod. Publishing is separate (scripts/publish-mod.ts).
 *
 * Idempotent: an entry whose repository, path and commit are already imported is skipped without a
 * request, so rerunning the same file changes nothing. The whole file's format is checked before
 * anything is fetched or written; an entry refused later is reported and the others still import.
 * It only creates mods: an entry re-pinned to a new commit of an existing mod is refused.
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
  github: GitHubSource
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

async function slugUsingName(db: Db, name: string): Promise<string | undefined> {
  const [row] = await db
    .select({ slug: schema.mods.slug })
    .from(schema.mods)
    .where(or(eq(schema.mods.pluginName, name), eq(schema.mods.slug, name)))
  return row?.slug
}

async function importEntry(
  entry: CurationEntry,
  { db, github, withSandbox }: ImportDeps,
  tarball: (entry: CurationEntry) => Promise<Uint8Array>,
): Promise<string> {
  const name = entry.pluginName
  const imported = await importedSlug(db, entry)
  if (imported) return `unchanged ${imported}: already imported at ${entry.commitSha}`
  const taken = await slugUsingName(db, name)
  if (taken) {
    throw new Error(
      `plugin name "${name}" is already used by mod "${taken}"; the import only creates new mods`,
    )
  }

  const repo = await github.repoInfo(entry.repoUrl)
  const canonical = `https://github.com/${repo.fullName}`
  if (canonical !== entry.repoUrl) throw new Error(`write the repository URL as ${canonical}`)
  const facts = await withSandbox(
    { tarball: await tarball(entry), path: entry.path },
    inspectPlugin,
  )
  if (facts.manifest.name !== name) {
    throw new Error(`plugin.json names the plugin "${facts.manifest.name}", not "${name}"`)
  }

  const modId = randomUUID()
  const versionId = randomUUID()
  await db.transaction(async (tx) => {
    await tx.insert(schema.mods).values({
      id: modId,
      slug: name,
      pluginName: name,
      title: entry.title,
      description: facts.manifest.description,
      authorGithub: repo.fullName.slice(0, repo.fullName.indexOf('/')),
      status: 'draft',
      currentVersionId: versionId,
    })
    await tx.insert(schema.modVersions).values({
      id: versionId,
      modId,
      versionNumber: 1,
      repoUrl: entry.repoUrl,
      path: entry.path,
      commitSha: entry.commitSha,
      pluginVersion: facts.manifest.version,
      license: repo.license,
      footprint: facts.footprint,
      validatedWith: facts.claudeCodeVersion,
      inputSteps: entry.inputSteps,
      desktopScreenshot: entry.desktopScreenshot,
    })
  })
  const { events, calls } = facts.footprint
  return `imported ${name} v1 at ${entry.commitSha}: plugin ${facts.manifest.version ?? 'unversioned'}, license ${repo.license ?? 'none'}, ${events.length} events, ${calls.length} calls`
}

const MAX_LINE_CHARS = 500

/**
 * plugin.json, validate output, tar stderr and git filenames reach these lines, so each is escaped
 * (an ESC or OSC 52 sequence could rewrite the log or the operator's clipboard) and capped.
 */
export function terminalLine(line: string): string {
  const escaped = printable(line)
  if (escaped.length <= MAX_LINE_CHARS) return escaped
  const suffix = (rest: number) => `… (${rest} more characters)`
  const head = escaped
    .slice(0, MAX_LINE_CHARS - suffix(escaped.length).length)
    .replace(/\\(u[0-9a-f]{0,3})?$/, '')
  return `${head}${suffix(escaped.length - head.length)}`
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

  const downloads = new Map<string, Promise<Uint8Array>>()
  const tarball = ({ repoUrl, commitSha }: CurationEntry) => {
    const key = `${repoUrl}@${commitSha}`
    const download = downloads.get(key) ?? deps.github.tarball(repoUrl, commitSha)
    downloads.set(key, download)
    return download
  }

  let refused = 0
  for (const entry of curation.entries) {
    try {
      log(await importEntry(entry, deps, tarball))
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
