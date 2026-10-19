import { parseArgs } from 'node:util'
import { and, eq, sql } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { isPooledUrl } from '@/db/is-pooled'
import * as schema from '@/db/schema'
import { requireEnv } from '@/lib/env'
import { forEachConcurrently } from '@/lib/for-each-concurrently'
import { STATUSLINE_ANYWHERE_MOD_SLUG } from '@/lib/statusline-anywhere'
import { inputStepsSchema } from '@/mods/curation'
import { createGitHub, type GitHubSource } from '@/mods/github'
import { terminalLine } from '@/mods/terminal-line'
import type { DesktopVersions } from '@/render/mods/desktop/desktop-sandbox'
import { e2bDesktopRecorder } from '@/render/mods/desktop/recorder'
import { realAnthropicHost } from '@/render/mods/desktop/session'
import type {
  DesktopRecorder,
  DesktopRecording,
  DesktopRecordRequest,
  StatusLineScript,
} from '@/render/mods/desktop/types'
import { INTERPRETERS, type Interpreter } from '@/render/types'

/**
 * Record how each published status line looks in Claude Desktop: drawn above the prompt by
 * statusline-anywhere, the mod that runs your `statusLine` command there, at the commit its
 * current mod version pins. Each status line is recorded in its own E2B Desktop sandbox and framed
 * against one no-mod baseline, and the band above the prompt is stored, or the fact that it drew
 * nothing (it printed nothing for Desktop's input). A status line's sandbox reaches only the hosts
 * the admin approved for it (ADR 0008), and the Anthropic usage mock answers a Claude token read.
 *
 * Records the current version of every published status line whose stored result was made with
 * another Desktop, engine or statusline-anywhere commit than now, or that has none. A status line
 * that needs a real Anthropic host is skipped: Desktop holds a fake key, so it never reaches one.
 * Each result is replaced in one statement; a recording that fails keeps the old result.
 * Refuses to run without E2B_API_KEY: a fake run would store "draws nothing" over every real shot.
 *
 * AGENT USAGE (needs DATABASE_URL and E2B_API_KEY; GITHUB_TOKEN is optional):
 *
 *   bun run render:status-line-desktop                 # every status line out of date
 *   bun run render:status-line-desktop --slug <slug>   # one status line, if out of date
 *   bun run render:status-line-desktop --all           # re-record every status line
 *
 * Prints one outcome per published status line. Exit code 0 when every recording stored a shot or
 * drew nothing, 1 when any failed or statusline-anywhere has no current version.
 */

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

export interface RenderStatusLineDesktopDeps {
  db: Db
  desktopRecorder: DesktopRecorder & {
    baseline(inputSteps: DesktopRecordRequest['inputSteps']): Promise<DesktopVersions>
  }
  github: Pick<GitHubSource, 'tarball'>
  log: (line: string) => void
}

const CONCURRENCY = 4

/** What a stored result was recorded with; it is out of date when any of it changes. */
type RecordedWith = DesktopVersions & { modCommitSha: string }

async function statuslineAnywhere(db: Db) {
  const [row] = await db
    .select({
      pluginName: schema.mods.pluginName,
      repoUrl: schema.modVersions.repoUrl,
      path: schema.modVersions.path,
      commitSha: schema.modVersions.commitSha,
      inputSteps: schema.modVersions.inputSteps,
    })
    .from(schema.mods)
    .innerJoin(schema.modVersions, eq(schema.modVersions.id, schema.mods.currentVersionId))
    .where(eq(schema.mods.slug, STATUSLINE_ANYWHERE_MOD_SLUG))
  return row ?? null
}

async function targets(db: Db, slug: string | undefined) {
  return (
    db
      .select({
        slug: schema.configs.slug,
        versionId: schema.configVersions.id,
        source: schema.configVersions.source,
        interpreter: schema.configVersions.interpreter,
        networkHosts: schema.configVersions.networkHosts,
        readsClaudeToken: schema.configVersions.readsClaudeToken,
        stored: {
          desktopVersion: schema.configDesktopPreviews.desktopVersion,
          engineVersion: schema.configDesktopPreviews.engineVersion,
          modCommitSha: schema.configDesktopPreviews.modCommitSha,
        },
      })
      .from(schema.configs)
      // current_version_id has no foreign key, so the join also checks the version is this config's.
      .innerJoin(
        schema.configVersions,
        and(
          eq(schema.configVersions.id, schema.configs.currentVersionId),
          eq(schema.configVersions.configId, schema.configs.id),
        ),
      )
      .leftJoin(
        schema.configDesktopPreviews,
        eq(schema.configDesktopPreviews.configVersionId, schema.configVersions.id),
      )
      .where(
        and(
          eq(schema.configs.status, 'published'),
          slug === undefined ? undefined : eq(schema.configs.slug, slug),
        ),
      )
      .orderBy(schema.configs.slug)
  )
}

type Target = Awaited<ReturnType<typeof targets>>[number]

const isCurrent = (stored: RecordedWith | null, now: RecordedWith) =>
  stored !== null &&
  stored.desktopVersion === now.desktopVersion &&
  stored.engineVersion === now.engineVersion &&
  stored.modCommitSha === now.modCommitSha

function interpreterOf(value: string): Interpreter {
  const interpreter = INTERPRETERS.find((known) => known === value)
  if (!interpreter) throw new Error(`unknown interpreter "${value}"`)
  return interpreter
}

function statusLineOf(target: Target): StatusLineScript {
  return {
    source: target.source,
    interpreter: interpreterOf(target.interpreter),
    networkHosts: target.networkHosts,
    readsClaudeToken: target.readsClaudeToken,
  }
}

/** Stores the card crop, the band statusline-anywhere draws above the prompt, not the full shot. */
async function store(db: Db, versionId: string, recording: DesktopRecording, modCommitSha: string) {
  const card = recording.kind === 'shot' ? recording.card : null
  const preview = {
    kind: recording.kind,
    png: card?.png ?? null,
    width: card?.width ?? null,
    height: card?.height ?? null,
    desktopVersion: recording.desktopVersion,
    engineVersion: recording.engineVersion,
    modCommitSha,
  }
  await db
    .insert(schema.configDesktopPreviews)
    .values({ configVersionId: versionId, ...preview })
    .onConflictDoUpdate({
      target: schema.configDesktopPreviews.configVersionId,
      set: { ...preview, createdAt: sql`now()` },
    })
}

export async function renderStatusLineDesktop(
  options: { slug?: string; all?: boolean },
  deps: RenderStatusLineDesktopDeps,
): Promise<number> {
  const log = (line: string) => deps.log(terminalLine(line))
  const mod = await statuslineAnywhere(deps.db)
  if (!mod) {
    log(
      `the ${STATUSLINE_ANYWHERE_MOD_SLUG} mod has no current version; import it first (import:mods)`,
    )
    return 1
  }
  const published = await targets(deps.db, options.slug)
  if (options.slug !== undefined && published.length === 0) {
    log(`no published status line with slug "${options.slug}"`)
    return 1
  }

  const tarball = await deps.github.tarball(mod.repoUrl, mod.commitSha)
  const request: Omit<DesktopRecordRequest, 'statusLine'> = {
    mod: { source: { tarball, path: mod.path }, pluginName: mod.pluginName },
    inputSteps: inputStepsSchema.parse(mod.inputSteps),
  }
  const now = {
    ...(await deps.desktopRecorder.baseline(request.inputSteps)),
    modCommitSha: mod.commitSha,
  }

  const todo: Target[] = []
  for (const target of published) {
    if (realAnthropicHost(statusLineOf(target))) {
      log(`skipped ${target.slug}: needs an Anthropic host; no Desktop shot`)
    } else if (!options.all && isCurrent(target.stored, now)) {
      log(`up to date ${target.slug} in Claude Desktop`)
    } else {
      todo.push(target)
    }
  }

  let failed = 0
  await forEachConcurrently(todo, CONCURRENCY, async (target) => {
    try {
      const recording = await deps.desktopRecorder.record({
        ...request,
        statusLine: statusLineOf(target),
      })
      await store(deps.db, target.versionId, recording, now.modCommitSha)
      log(
        `${recording.kind === 'shot' ? 'rendered' : 'drew nothing'} ${target.slug} in Claude Desktop`,
      )
    } catch (error) {
      failed++
      const reason = error instanceof Error ? error.message : String(error)
      log(`failed ${target.slug} in Claude Desktop: ${reason}`)
    }
  })
  return failed === 0 ? 0 : 1
}

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: { slug: { type: 'string' }, all: { type: 'boolean' } },
    strict: true,
  })
  const url = requireEnv('DATABASE_URL')
  requireEnv('E2B_API_KEY')
  const client = postgres(url, isPooledUrl(url) ? { prepare: false } : {})
  const db = drizzle({ client, schema }) as unknown as Db
  try {
    return await renderStatusLineDesktop(values, {
      db,
      desktopRecorder: e2bDesktopRecorder(),
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
      console.error(
        terminalLine(`[render-status-line-desktop] ${err instanceof Error ? err.message : err}`),
      )
      process.exit(1)
    },
  )
}
