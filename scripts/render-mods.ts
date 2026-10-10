import { parseArgs } from 'node:util'
import { and, eq, ne, sql } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { isPooledUrl } from '@/db/is-pooled'
import * as schema from '@/db/schema'
import { requireEnv } from '@/lib/env'
import { inputStepsSchema } from '@/mods/curation'
import { createGitHub, type GitHubSource } from '@/mods/github'
import { MOD_SCENARIO_KEY } from '@/mods/queries'
import { terminalLine } from '@/mods/terminal-line'
import { boundRecording } from '@/render/mods/bound-recording'
import { cropModPreview } from '@/render/mods/crop'
import { FakeModRecorder } from '@/render/mods/fake-recorder'
import { e2bModRecorder, type ModRecorder, type Recording } from '@/render/mods/recorder'
import type { AnsiSegment } from '@/render/types'

/**
 * Render the current version of each mod that is not removed against the `clean-main` scenario and
 * store its preview. Every mod is recorded in its own offline E2B sandbox and cropped against one
 * baseline recording (the same session with no mod), shared across the run while the Claude Code
 * version matches.
 *
 * A version's preview is replaced in one statement. A crop with no rows of its own is stored as an
 * empty preview, which records that the mod draws nothing in the terminal. A version whose run fails
 * keeps whatever preview it had; nothing is ever deleted. Uses real E2B when E2B_API_KEY is set, else
 * a fake recorder under which every mod draws nothing.
 *
 * AGENT USAGE (needs DATABASE_URL, and E2B_API_KEY for real renders):
 *
 *   bun run render:mods                 # every mod's current version
 *   bun run render:mods --slug <slug>   # one mod
 *
 * Exit code 0 when every mod rendered or cleanly did not, 1 when any run failed.
 */

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

export interface RenderModsDeps {
  db: Db
  recorder: ModRecorder
  github: Pick<GitHubSource, 'tarball'>
  log: (line: string) => void
}

const CONCURRENCY = 4

type Outcome = { kind: 'rendered' } | { kind: 'drew nothing' } | { kind: 'failed'; reason: string }

interface Target {
  slug: string
  pluginName: string
  versionId: string
  repoUrl: string
  path: string
  commitSha: string
  /** Stored jsonb, parsed in renderTarget so a malformed row fails only its own mod. */
  inputSteps: unknown
}

async function targets(db: Db, slug: string | undefined): Promise<Target[]> {
  const rows = await db
    .select({
      slug: schema.mods.slug,
      pluginName: schema.mods.pluginName,
      versionId: schema.modVersions.id,
      repoUrl: schema.modVersions.repoUrl,
      path: schema.modVersions.path,
      commitSha: schema.modVersions.commitSha,
      inputSteps: schema.modVersions.inputSteps,
    })
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
        ne(schema.mods.status, 'removed'),
        slug === undefined ? undefined : eq(schema.mods.slug, slug),
      ),
    )
    .orderBy(schema.mods.slug)
  return rows
}

/** One baseline per Claude Code version, recorded the first time a mod's recording asks for it. */
function sharedBaselines(recorder: ModRecorder): (version: string) => Promise<Recording> {
  const record = async () => boundRecording(await recorder.record({ mod: null, inputSteps: [] }))
  const byVersion = new Map<string, Promise<Recording>>()
  let first: Promise<Recording> | undefined
  return async (version) => {
    first ??= record()
    const initial = await first
    if (initial.claudeCodeVersion === version) return initial
    const pending = byVersion.get(version) ?? record()
    byVersion.set(version, pending)
    const baseline = await pending
    if (baseline.claudeCodeVersion !== version) {
      throw new Error(
        `the baseline ran Claude Code ${baseline.claudeCodeVersion} but the mod ran ${version}`,
      )
    }
    return baseline
  }
}

async function storePreview(
  db: Db,
  versionId: string,
  segments: AnsiSegment[],
  claudeCodeVersion: string,
) {
  const preview = { segments, claudeCodeVersion }
  await db
    .insert(schema.modPreviews)
    .values({ modVersionId: versionId, scenarioKey: MOD_SCENARIO_KEY, ...preview })
    .onConflictDoUpdate({
      target: [schema.modPreviews.modVersionId, schema.modPreviews.scenarioKey],
      set: { ...preview, createdAt: sql`now()` },
    })
}

async function renderTarget(
  target: Target,
  { db, recorder, github }: RenderModsDeps,
  baselineFor: (version: string) => Promise<Recording>,
): Promise<Outcome> {
  const inputSteps = inputStepsSchema.parse(target.inputSteps)
  const recording = boundRecording(
    await recorder.record({
      mod: {
        source: {
          tarball: await github.tarball(target.repoUrl, target.commitSha),
          path: target.path,
        },
        pluginName: target.pluginName,
      },
      inputSteps,
    }),
  )
  const baseline = await baselineFor(recording.claudeCodeVersion)
  const crop = cropModPreview(baseline.rows, recording.rows)
  const segments = crop.kind === 'rendered' ? crop.segments : []
  await storePreview(db, target.versionId, segments, recording.claudeCodeVersion)
  return { kind: crop.kind === 'rendered' ? 'rendered' : 'drew nothing' }
}

async function forEachConcurrently<T>(items: T[], limit: number, work: (item: T) => Promise<void>) {
  const queue = [...items]
  const worker = async () => {
    for (let item = queue.shift(); item !== undefined; item = queue.shift()) await work(item)
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
}

export async function renderMods(
  options: { slug?: string },
  deps: RenderModsDeps,
): Promise<number> {
  const log = (line: string) => deps.log(terminalLine(line))
  const todo = await targets(deps.db, options.slug)
  if (options.slug !== undefined && todo.length === 0) {
    log(`no mod with slug "${options.slug}" has a current version`)
    return 1
  }

  const baselineFor = sharedBaselines(deps.recorder)

  let failed = 0
  await forEachConcurrently(todo, CONCURRENCY, async (target) => {
    const outcome = await renderTarget(target, deps, baselineFor).catch(
      (error): Outcome => ({
        kind: 'failed',
        reason: error instanceof Error ? error.message : String(error),
      }),
    )
    if (outcome.kind === 'failed') failed++
    log(`${outcome.kind} ${target.slug}${'reason' in outcome ? `: ${outcome.reason}` : ''}`)
  })
  return failed === 0 ? 0 : 1
}

async function main(): Promise<number> {
  const { values } = parseArgs({ options: { slug: { type: 'string' } }, strict: true })
  const url = requireEnv('DATABASE_URL')
  const client = postgres(url, isPooledUrl(url) ? { prepare: false } : {})
  const db = drizzle({ client, schema }) as unknown as Db
  const recorder = process.env.E2B_API_KEY ? e2bModRecorder : new FakeModRecorder({ baseline: [] })
  if (!process.env.E2B_API_KEY) console.log('E2B_API_KEY is not set: using the fake recorder')
  try {
    return await renderMods(values, {
      db,
      recorder,
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
      console.error(terminalLine(`[render-mods] ${err instanceof Error ? err.message : err}`))
      process.exit(1)
    },
  )
}
