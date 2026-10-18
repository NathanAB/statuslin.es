import { and, eq } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { isPooledUrl } from '@/db/is-pooled'
import * as schema from '@/db/schema'
import { requireEnv } from '@/lib/env'
import { createGitHub, type GitHub } from '@/mods/github'
import { hasSubmission } from '@/mods/import'
import {
  alreadyCurrentGuard,
  compareBase,
  confirmationGuards,
  currentChangedGuard,
  type Guard,
  guardLine,
  loadCurrentVersion,
  loadVersions,
  type PublishFacts,
  type PublishVersion,
  publishedRow,
  publishGuards,
  refuses,
  removedGuard,
  shaGuards,
} from '@/mods/publish'
import { publishReport } from '@/mods/publish-report'
import { terminalLine } from '@/mods/terminal-line'

/**
 * Publish a mod version, or re-pin a published mod to a newer one. The version must already exist
 * (the mod import, issue #40, creates them); publishing makes it the mod's current version and sets the
 * mod to 'published', which puts it in /marketplace.json at that commit.
 *
 * Guards. It refuses a SHA that is not 40 lowercase hex, a SHA that matches more than one version of
 * the mod, a commit not on the repo's default branch, a commit not ahead of the live one, a version
 * that has not rendered, a delisted mod (use delist-mod.ts --restore), the version a published mod
 * already points at, and a mod a user submitted (approve it on /admin, which names it and checks
 * its folder). A draft's publish is a first publish, with nothing to compare against. It prints the
 * repository and path, the files changed since the current commit, and the footprint, before and
 * after. It warns when the repository or path changes, when GitHub truncates the file list, when
 * the footprint adds events or $ calls, and when plugin.json's `version` is unchanged (Claude Code
 * then won't update existing installs).
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

const submittedGuard = (slug: string): Guard => ({
  level: 'refuse',
  name: 'submitted',
  message: `"${slug}" was submitted by a user: approve it on /admin`,
})

async function loadFacts(db: Db, github: GitHub, slug: string, sha: string) {
  const [mod] = await db
    .select({
      id: schema.mods.id,
      status: schema.mods.status,
      description: schema.mods.description,
      currentVersionId: schema.mods.currentVersionId,
    })
    .from(schema.mods)
    .where(eq(schema.mods.slug, slug))
  if (!mod) throw new Error(`no mod found with slug "${slug}"`)
  const [submitted] = await db
    .select({ id: schema.mods.id })
    .from(schema.mods)
    .where(and(eq(schema.mods.id, mod.id), hasSubmission(db)))
  if (submitted) return { refusal: submittedGuard(slug) }

  const targets = await loadVersions(
    db,
    and(eq(schema.modVersions.modId, mod.id), eq(schema.modVersions.commitSha, sha)),
  )
  const [target] = targets
  if (!target) throw new Error(`no version of "${slug}" at ${sha}; import it first`)
  if (targets.length > 1) {
    throw new Error(`${targets.length} versions of "${slug}" at ${sha}; publish needs exactly one`)
  }
  const pointedVersion = await loadCurrentVersion(db, mod)
  const current = mod.status === 'published' ? pointedVersion : null
  if (current?.id === target.id) return { refusal: alreadyCurrentGuard(slug, sha) }
  const base = compareBase(current, target)

  const facts: PublishFacts = {
    slug,
    modStatus: mod.status,
    description: mod.description,
    target,
    current,
    onDefaultBranch: await github.commitIsOnDefaultBranch(target.repoUrl, sha),
    filesChanged: base ? await github.filesChanged(target.repoUrl, base.commitSha, sha) : null,
    comparedToLive: base ? await github.compareCommits(target.repoUrl, base.commitSha, sha) : null,
  }
  return { modId: mod.id, readPointerId: mod.currentVersionId, facts }
}

function parseArgs(argv: string[]) {
  const [slug, sha] = argv.filter((a) => !a.startsWith('--'))
  return { slug, sha, apply: argv.includes('--apply') }
}

/**
 * Writes only while the mod's status and current_version_id are still what the report read, since
 * both decide what it compared against; otherwise returns the guard that explains what changed.
 */
async function makeCurrent(
  db: Db,
  {
    modId,
    target,
    slug,
    readStatus,
    readPointerId,
  }: {
    modId: string
    target: PublishVersion
    slug: string
    readStatus: schema.ModStatus
    readPointerId: string | null
  },
): Promise<Guard | null> {
  return db.transaction(async (tx) => {
    const [mod] = await tx
      .select({
        status: schema.mods.status,
        currentVersionId: schema.mods.currentVersionId,
        tags: schema.mods.tags,
      })
      .from(schema.mods)
      .where(eq(schema.mods.id, modId))
      .for('update')
    if (mod?.status !== readStatus || mod.currentVersionId !== readPointerId) {
      return mod?.status === 'removed' ? removedGuard(slug) : currentChangedGuard(slug)
    }
    await tx
      .update(schema.mods)
      .set(publishedRow(target, mod.tags))
      .where(eq(schema.mods.id, modId))
    return null
  })
}

export async function runPublish(argv: string[], deps: PublishDeps): Promise<number> {
  const { db, github } = deps
  const log = (line: string) => deps.log(terminalLine(line))
  const { slug, sha, apply } = parseArgs(argv)
  if (!slug || !sha) {
    for (const line of USAGE.split('\n')) log(line)
    return 1
  }

  const shaRefusals = shaGuards(sha)
  if (refuses(shaRefusals)) {
    for (const g of shaRefusals) log(guardLine(g))
    return 1
  }

  const loaded = await loadFacts(db, github, slug, sha)
  if ('refusal' in loaded) {
    log(guardLine(loaded.refusal))
    return 1
  }
  const { modId, readPointerId, facts } = loaded
  const guards = [...publishGuards(facts), ...(apply ? confirmationGuards(slug, argv) : [])]
  for (const line of publishReport(facts)) log(line)
  for (const g of guards) log(guardLine(g))

  if (refuses(guards)) return 1
  if (!apply) {
    log(`dry run: nothing changed. Rerun with --apply --confirm=${slug} to publish.`)
    return 0
  }
  const refusal = await makeCurrent(db, {
    modId,
    target: facts.target,
    slug,
    readStatus: facts.modStatus,
    readPointerId,
  })
  if (refusal) {
    log(guardLine(refusal))
    return 1
  }
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
      console.error(terminalLine(`[publish-mod] ${err instanceof Error ? err.message : err}`))
      process.exit(1)
    },
  )
}
