import { parseArgs } from 'node:util'
import { and, eq, ne, sql } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { isPooledUrl } from '@/db/is-pooled'
import * as schema from '@/db/schema'
import { requireEnv } from '@/lib/env'
import { type InputStep, inputStepsSchema } from '@/mods/curation'
import { describeFootprint, type Surface } from '@/mods/footprint'
import { createGitHub, type GitHubSource } from '@/mods/github'
import { MOD_SCENARIO_KEY } from '@/mods/queries'
import { terminalLine } from '@/mods/terminal-line'
import { boundRecording } from '@/render/mods/bound-recording'
import { cropModPreview } from '@/render/mods/crop'
import { FakeDesktopRecorder } from '@/render/mods/desktop/fake-recorder'
import { e2bDesktopRecorder } from '@/render/mods/desktop/recorder'
import type { DesktopRecorder, DesktopRecording } from '@/render/mods/desktop/types'
import { FakeModRecorder } from '@/render/mods/fake-recorder'
import {
  e2bModRecorder,
  type ModRecorder,
  type ModUnderRender,
  type Recording,
} from '@/render/mods/recorder'
import type { AnsiSegment } from '@/render/types'

/**
 * Render the current version of each mod that is not removed against the `clean-main` scenario and
 * store its preview on both surfaces, the terminal and Claude Desktop.
 *
 * Terminal: every mod is recorded in its own offline E2B sandbox and cropped against one baseline
 * recording (the same session with no mod), shared across the run while the Claude Code version
 * matches. A crop with no rows of its own is stored as an empty preview, which records that the mod
 * draws nothing in the terminal. Claude Desktop: the Desktop recorder frames the mod where its
 * footprint says it draws, and stores the PNG, or the fact that it drew nothing.
 *
 * Each surface's result is replaced in one statement. The surfaces are independent: a surface whose
 * run fails keeps whatever result it had, and the other surface is still stored; nothing is ever
 * deleted. Uses real E2B for both surfaces when E2B_API_KEY is set, else fake recorders under which
 * every mod draws nothing.
 *
 * AGENT USAGE (needs DATABASE_URL, and E2B_API_KEY for real renders):
 *
 *   bun run render:mods                 # every mod's current version
 *   bun run render:mods --slug <slug>   # one mod
 *
 * Prints one outcome per mod per surface. Exit code 0 when every surface rendered or drew nothing,
 * 1 when any surface failed.
 */

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

export interface RenderModsDeps {
  db: Db
  recorder: ModRecorder
  desktopRecorder: DesktopRecorder
  github: Pick<GitHubSource, 'tarball'>
  log: (line: string) => void
}

const CONCURRENCY = 4

type Outcome = { kind: 'rendered' } | { kind: 'drew nothing' } | { kind: 'failed'; reason: string }

const IN_SURFACE: Record<Surface, string> = {
  terminal: 'in the terminal',
  desktop: 'in Claude Desktop',
}

interface Target {
  slug: string
  pluginName: string
  versionId: string
  repoUrl: string
  path: string
  commitSha: string
  /** Stored jsonb, parsed in renderTarget so a malformed row fails only its own mod. */
  inputSteps: unknown
  footprint: schema.ModFootprint
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
      footprint: schema.modVersions.footprint,
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

async function storeDesktopPreview(db: Db, versionId: string, recording: DesktopRecording) {
  const shot = recording.kind === 'shot' ? recording : null
  const preview = {
    kind: recording.kind,
    png: shot?.png ?? null,
    width: shot?.width ?? null,
    height: shot?.height ?? null,
    cardAnchor: shot?.cardAnchor ?? null,
    desktopVersion: recording.desktopVersion,
    engineVersion: recording.engineVersion,
  }
  await db
    .insert(schema.modDesktopPreviews)
    .values({ modVersionId: versionId, scenarioKey: MOD_SCENARIO_KEY, ...preview })
    .onConflictDoUpdate({
      target: [schema.modDesktopPreviews.modVersionId, schema.modDesktopPreviews.scenarioKey],
      set: { ...preview, createdAt: sql`now()` },
    })
}

interface ModRequest {
  mod: ModUnderRender
  inputSteps: InputStep[]
}

async function renderTerminal(
  target: Target,
  request: ModRequest,
  { db, recorder }: RenderModsDeps,
  baselineFor: (version: string) => Promise<Recording>,
): Promise<Outcome> {
  const recording = boundRecording(await recorder.record(request))
  const baseline = await baselineFor(recording.claudeCodeVersion)
  const crop = cropModPreview(baseline.rows, recording.rows)
  const segments = crop.kind === 'rendered' ? crop.segments : []
  await storePreview(db, target.versionId, segments, recording.claudeCodeVersion)
  return { kind: crop.kind === 'rendered' ? 'rendered' : 'drew nothing' }
}

async function renderDesktop(
  target: Target,
  request: ModRequest,
  { db, desktopRecorder }: RenderModsDeps,
): Promise<Outcome> {
  const draws = describeFootprint(target.footprint).draws
  const recording = await desktopRecorder.record({ ...request, draws })
  await storeDesktopPreview(db, target.versionId, recording)
  return { kind: recording.kind === 'shot' ? 'rendered' : 'drew nothing' }
}

const failure = (error: unknown): Outcome => ({
  kind: 'failed',
  reason: error instanceof Error ? error.message : String(error),
})

/** Both surfaces need the mod's source; past that, neither surface's failure touches the other. */
async function renderTarget(
  target: Target,
  deps: RenderModsDeps,
  baselineFor: (version: string) => Promise<Recording>,
): Promise<Record<Surface, Outcome>> {
  let request: ModRequest
  try {
    const inputSteps = inputStepsSchema.parse(target.inputSteps)
    const tarball = await deps.github.tarball(target.repoUrl, target.commitSha)
    const source = { tarball, path: target.path }
    request = { mod: { source, pluginName: target.pluginName }, inputSteps }
  } catch (error) {
    return { terminal: failure(error), desktop: failure(error) }
  }
  const [terminal, desktop] = await Promise.all([
    renderTerminal(target, request, deps, baselineFor).catch(failure),
    renderDesktop(target, request, deps).catch(failure),
  ])
  return { terminal, desktop }
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
    const outcomes = await renderTarget(target, deps, baselineFor)
    for (const surface of ['terminal', 'desktop'] as const) {
      const outcome = outcomes[surface]
      if (outcome.kind === 'failed') failed++
      const reason = 'reason' in outcome ? `: ${outcome.reason}` : ''
      log(`${outcome.kind} ${target.slug} ${IN_SURFACE[surface]}${reason}`)
    }
  })
  return failed === 0 ? 0 : 1
}

async function main(): Promise<number> {
  const { values } = parseArgs({ options: { slug: { type: 'string' } }, strict: true })
  const url = requireEnv('DATABASE_URL')
  const client = postgres(url, isPooledUrl(url) ? { prepare: false } : {})
  const db = drizzle({ client, schema }) as unknown as Db
  const real = Boolean(process.env.E2B_API_KEY)
  const recorder = real ? e2bModRecorder : new FakeModRecorder({ baseline: [] })
  const desktopRecorder = real ? e2bDesktopRecorder() : new FakeDesktopRecorder()
  if (!real) console.log('E2B_API_KEY is not set: using the fake recorders')
  try {
    return await renderMods(values, {
      db,
      recorder,
      desktopRecorder,
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
