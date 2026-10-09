import { and, eq, type SQL, sql } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { isPooledUrl } from '@/db/is-pooled'
import * as schema from '@/db/schema'
import { requireEnv } from '@/lib/env'
import { createGitHub, type GitHub } from '@/mods/github'
import {
  confirmationGuards,
  type Guard,
  guardLine,
  type PublishFacts,
  type PublishVersion,
  publishGuards,
  publishReport,
  shaGuards,
} from '@/mods/publish'
import { versionIsRendered } from '@/mods/queries'

/**
 * Publish a mod version, or re-pin a published mod to a newer one. The version must already exist
 * (the import script creates versions); publishing makes it the mod's current version and sets the
 * mod to 'published', which puts it in /marketplace.json at that commit.
 *
 * Guards. It refuses a SHA that is not 40 lowercase hex, a commit not on the repo's default branch,
 * a version that has not rendered, and a delisted mod (use delist-mod.ts --restore). It prints the
 * files changed since the current commit and the footprint before and after, and warns when the
 * footprint adds events or $ calls, or when plugin.json's `version` is unchanged (Claude Code then
 * won't update existing installs).
 *
 * AGENT USAGE — a dry run by default; nothing changes without `--apply --confirm=<slug>`:
 *
 *   fly ssh console --app statuslines --command "bun run scripts/publish-mod.ts <slug> <sha>"
 *   fly ssh console --app statuslines --command "bun run scripts/publish-mod.ts <slug> <sha> --apply --confirm=<slug>"
 *
 *   # Or from your machine against any env:
 *   DATABASE_URL=<env-url> bun run scripts/publish-mod.ts <slug> <sha> [--apply --confirm=<slug>]
 *
 * Read the WARN lines before applying. Exit code 0 on a clean dry run or a publish, 1 on any
 * refusal or error.
 */

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

export interface PublishDeps {
  db: Db
  github: GitHub
  log: (line: string) => void
}

const USAGE = `Usage: bun run scripts/publish-mod.ts <slug> <sha> [--apply --confirm=<slug>]
  default            dry run: print the checks, files changed and footprint
  --apply            make the version current and the mod published
  --confirm=<slug>   required with --apply: type the slug back`

const versionColumns = {
  id: schema.modVersions.id,
  repoUrl: schema.modVersions.repoUrl,
  commitSha: schema.modVersions.commitSha,
  pluginVersion: schema.modVersions.pluginVersion,
  footprint: schema.modVersions.footprint,
  rendered: sql<boolean>`${versionIsRendered}`,
}

type VersionRow = PublishVersion & { id: string; repoUrl: string }

async function loadVersion(db: Db, where: SQL | undefined): Promise<VersionRow | null> {
  const [row] = await db.select(versionColumns).from(schema.modVersions).where(where)
  return row ?? null
}

async function loadFacts(db: Db, github: GitHub, slug: string, sha: string) {
  const [mod] = await db
    .select({
      id: schema.mods.id,
      status: schema.mods.status,
      currentVersionId: schema.mods.currentVersionId,
    })
    .from(schema.mods)
    .where(eq(schema.mods.slug, slug))
  if (!mod) throw new Error(`no mod found with slug "${slug}"`)

  const target = await loadVersion(
    db,
    and(eq(schema.modVersions.modId, mod.id), eq(schema.modVersions.commitSha, sha)),
  )
  if (!target) throw new Error(`no version of "${slug}" at ${sha}; import it first`)
  const current = mod.currentVersionId
    ? await loadVersion(db, eq(schema.modVersions.id, mod.currentVersionId))
    : null

  const facts: PublishFacts = {
    slug,
    modStatus: mod.status,
    target,
    current,
    onDefaultBranch: await github.commitIsOnDefaultBranch(target.repoUrl, sha),
    filesChanged: current
      ? await github.filesChanged(target.repoUrl, current.commitSha, sha)
      : null,
  }
  return { modId: mod.id, targetId: target.id, facts }
}

function parseArgs(argv: string[]) {
  const [slug, sha] = argv.filter((a) => !a.startsWith('--'))
  const confirmArg = argv.find((a) => a.startsWith('--confirm='))
  return {
    slug,
    sha,
    apply: argv.includes('--apply'),
    confirm: confirmArg ? confirmArg.slice('--confirm='.length) : null,
  }
}

function refused(guards: Guard[]): boolean {
  return guards.some((g) => g.level === 'refuse')
}

export async function runPublish(
  argv: string[],
  { db, github, log }: PublishDeps,
): Promise<number> {
  const { slug, sha, apply, confirm } = parseArgs(argv)
  if (!slug || !sha) {
    log(USAGE)
    return 1
  }

  const badSha = shaGuards(sha)
  if (refused(badSha)) {
    for (const g of badSha) log(guardLine(g))
    return 1
  }

  const { modId, targetId, facts } = await loadFacts(db, github, slug, sha)
  const guards = [...publishGuards(facts), ...(apply ? confirmationGuards(slug, confirm) : [])]
  for (const line of publishReport(facts)) log(line)
  for (const g of guards) log(guardLine(g))

  if (refused(guards)) return 1
  if (!apply) {
    log(`dry run: nothing changed. Rerun with --apply --confirm=${slug} to publish.`)
    return 0
  }
  await db
    .update(schema.mods)
    .set({ currentVersionId: targetId, status: 'published' })
    .where(eq(schema.mods.id, modId))
  log(`published "${slug}" at ${sha}`)
  return 0
}

async function main(): Promise<number> {
  const url = requireEnv('DATABASE_URL')
  const client = postgres(url, isPooledUrl(url) ? { prepare: false } : {})
  const db = drizzle({ client, schema }) as unknown as Db
  try {
    return await runPublish(process.argv.slice(2), {
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
      console.error(`[publish-mod] ${err instanceof Error ? err.message : err}`)
      process.exit(1)
    },
  )
}
