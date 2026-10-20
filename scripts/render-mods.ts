import { createInterface } from 'node:readline/promises'
import { parseArgs } from 'node:util'
import { and, eq, gt, inArray, ne, notExists, or, sql } from 'drizzle-orm'
import { alias, type PgDatabase } from 'drizzle-orm/pg-core'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { isPooledUrl } from '@/db/is-pooled'
import * as schema from '@/db/schema'
import { requireEnv } from '@/lib/env'
import { forEachConcurrently } from '@/lib/for-each-concurrently'
import { type InputStep, inputStepsSchema } from '@/mods/curation'
import type { Surface } from '@/mods/footprint'
import { createGitHub, type GitHubSource } from '@/mods/github'
import { type PngWriter, previewReviewLines, writeTmpPng } from '@/mods/preview-review'
import { MOD_SCENARIO_KEY } from '@/mods/queries'
import { parseReplaceAnswer, replaceQuestion } from '@/mods/replace-live-previews'
import { terminalLine } from '@/mods/terminal-line'
import { boundRecording } from '@/render/mods/bound-recording'
import { cropModPreview } from '@/render/mods/crop'
import { e2bDesktopRecorder } from '@/render/mods/desktop/recorder'
import type { DesktopRecorder, DesktopRecording } from '@/render/mods/desktop/types'
import {
  e2bModRecorder,
  type ModRecorder,
  type ModUnderRender,
  type Recording,
} from '@/render/mods/recorder'
import type { AnsiSegment } from '@/render/types'

/**
 * Render the current version of each mod that is not removed against the `clean-main` scenario and
 * store its preview on both surfaces, the terminal and Claude Desktop, plus the mod's newest version
 * when that is not the current one, so a re-pinned version (import:mods) has previews before
 * publish-mod.ts makes it current. A submitted version whose submission was rejected or replaced is
 * skipped: it will never go live.
 *
 * Terminal: every mod is recorded in its own offline E2B sandbox and cropped against a baseline
 * recording (the same session, typing the same input steps, with no mod), shared across the run by
 * mods with the same input steps while the Claude Code version matches. A crop with no rows of its own is stored as an empty preview, which records that the mod
 * draws nothing in the terminal. Claude Desktop: the Desktop recorder frames what the mod draws
 * there, and stores the PNG, or the fact that it drew nothing.
 *
 * A published mod's current version is live, so its new results are held until the run ends. Then
 * each held mod is printed beside its README, fenced as untrusted, in slug order, and one question
 * lists them all: `y` replaces every one, `n` or an empty answer none, and a list of slugs leaves
 * those out and replaces the rest. A slug the run did not hold replaces none. A live mod whose
 * surface failed keeps its live previews, and so does every mod off a terminal. Every other version
 * stores as it renders.
 *
 * Each surface's result is replaced in one statement. The surfaces are independent: a surface whose
 * run fails keeps whatever result it had, and the other surface is still stored; nothing is ever
 * deleted. Refuses to run without E2B_API_KEY: a fake run would store "draws nothing" over every
 * real preview, and those results would satisfy publish's rendered check.
 *
 * AGENT USAGE (needs DATABASE_URL and E2B_API_KEY):
 *
 *   bun run render:mods                 # every mod's current and newest version
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
  github: Pick<GitHubSource, 'tarball' | 'readme'>
  log: (line: string) => void
  /** Shows the operator the review lines, then asks the question, and returns their raw answer. */
  review: (lines: string[], question: string) => Promise<string>
  writePng: PngWriter
}

const CONCURRENCY = 4

type Outcome = { kind: 'rendered' } | { kind: 'drew nothing' } | { kind: 'failed'; reason: string }

const IN_SURFACE: Record<Surface, string> = {
  terminal: 'in the terminal',
  desktop: 'in Claude Desktop',
}

interface Target {
  slug: string
  status: schema.ModStatus
  pluginName: string
  versionId: string
  versionNumber: number
  currentVersionId: string | null
  repoUrl: string
  path: string
  commitSha: string
  /** Stored jsonb, parsed in renderTarget so a malformed row fails only its own mod. */
  inputSteps: unknown
}

async function targets(db: Db, slug: string | undefined): Promise<Target[]> {
  const newer = alias(schema.modVersions, 'newer')
  const rows = await db
    .select({
      slug: schema.mods.slug,
      status: schema.mods.status,
      pluginName: schema.mods.pluginName,
      versionId: schema.modVersions.id,
      versionNumber: schema.modVersions.versionNumber,
      currentVersionId: schema.mods.currentVersionId,
      repoUrl: schema.modVersions.repoUrl,
      path: schema.modVersions.path,
      commitSha: schema.modVersions.commitSha,
      inputSteps: schema.modVersions.inputSteps,
    })
    .from(schema.mods)
    .innerJoin(schema.modVersions, eq(schema.modVersions.modId, schema.mods.id))
    .where(
      and(
        ne(schema.mods.status, 'removed'),
        slug === undefined ? undefined : eq(schema.mods.slug, slug),
        // A submitted version that was rejected or replaced will never be approved.
        notExists(
          db
            .select({ id: schema.submissions.id })
            .from(schema.submissions)
            .where(
              and(
                eq(schema.submissions.modVersionId, schema.modVersions.id),
                inArray(schema.submissions.status, ['rejected', 'superseded']),
              ),
            ),
        ),
        or(
          eq(schema.modVersions.id, schema.mods.currentVersionId),
          notExists(
            db
              .select({ id: newer.id })
              .from(newer)
              .where(
                and(
                  eq(newer.modId, schema.mods.id),
                  gt(newer.versionNumber, schema.modVersions.versionNumber),
                ),
              ),
          ),
        ),
      ),
    )
    .orderBy(schema.mods.slug, schema.modVersions.versionNumber)
  return rows
}

/** The slug alone for the current version; a newer one is named by its number. */
function label(target: Target): string {
  if (target.versionId === target.currentVersionId) return target.slug
  return `${target.slug} v${target.versionNumber} (not current)`
}

type BaselineFor = (version: string, inputSteps: InputStep[]) => Promise<Recording>

/**
 * The baseline types the mod's input steps too, so the turns they start crop away and only what
 * the mod drew is left. One per list of steps, shared by the mods that type the same ones.
 */
function sharedBaselines(recorder: ModRecorder): BaselineFor {
  const bySteps = new Map<string, (version: string) => Promise<Recording>>()
  return (version, inputSteps) => {
    const key = JSON.stringify(inputSteps)
    const forSteps = bySteps.get(key) ?? baselinesByVersion(recorder, inputSteps)
    bySteps.set(key, forSteps)
    return forSteps(version)
  }
}

/** One baseline per Claude Code version, recorded the first time a mod's recording asks for it. */
function baselinesByVersion(
  recorder: ModRecorder,
  inputSteps: InputStep[],
): (version: string) => Promise<Recording> {
  const record = async () => boundRecording(await recorder.record({ mod: null, inputSteps }))
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
    cardPng: shot?.card.png ?? null,
    cardWidth: shot?.card.width ?? null,
    cardHeight: shot?.card.height ?? null,
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

interface TerminalResult {
  segments: AnsiSegment[]
  claudeCodeVersion: string
}

/** Where a version's results go: straight to the database, or held for the operator's review. */
interface Results {
  terminal(result: TerminalResult): Promise<void>
  desktop(recording: DesktopRecording): Promise<void>
}

const storeResults = (db: Db, versionId: string): Results => ({
  terminal: (result) => storePreview(db, versionId, result.segments, result.claudeCodeVersion),
  desktop: (recording) => storeDesktopPreview(db, versionId, recording),
})

interface Held {
  target: Target
  terminal: TerminalResult
  desktop: DesktopRecording
}

function holdResults(held: Partial<Held>): Results {
  return {
    async terminal(result) {
      held.terminal = result
    },
    async desktop(recording) {
      held.desktop = recording
    },
  }
}

async function renderTerminal(
  request: ModRequest,
  { recorder }: RenderModsDeps,
  baselineFor: BaselineFor,
  results: Results,
): Promise<Outcome> {
  const recording = boundRecording(await recorder.record(request))
  const baseline = await baselineFor(recording.claudeCodeVersion, request.inputSteps)
  const crop = cropModPreview(baseline.rows, recording.rows)
  const segments = crop.kind === 'rendered' ? crop.segments : []
  await results.terminal({ segments, claudeCodeVersion: recording.claudeCodeVersion })
  return { kind: crop.kind === 'rendered' ? 'rendered' : 'drew nothing' }
}

async function renderDesktop(
  request: ModRequest,
  { desktopRecorder }: RenderModsDeps,
  results: Results,
): Promise<Outcome> {
  const recording = await desktopRecorder.record(request)
  await results.desktop(recording)
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
  baselineFor: BaselineFor,
  results: Results,
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
    renderTerminal(request, deps, baselineFor, results).catch(failure),
    renderDesktop(request, deps, results).catch(failure),
  ])
  return { terminal, desktop }
}

function outcomeLine(target: Target, surface: Surface, outcome: Outcome): string {
  const reason = 'reason' in outcome ? `: ${outcome.reason}` : ''
  return `${outcome.kind} ${label(target)} ${IN_SURFACE[surface]}${reason}`
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
  const held: Held[] = []
  await forEachConcurrently(todo, CONCURRENCY, async (target) => {
    const live = target.status === 'published' && target.versionId === target.currentVersionId
    const hold: Partial<Held> = {}
    const results = live ? holdResults(hold) : storeResults(deps.db, target.versionId)
    const outcomes = await renderTarget(target, deps, baselineFor, results)
    for (const surface of ['terminal', 'desktop'] as const) {
      const outcome = outcomes[surface]
      if (outcome.kind === 'failed') failed++
      log(outcomeLine(target, surface, outcome))
    }
    if (!live) return
    if (hold.terminal && hold.desktop)
      held.push({ target, terminal: hold.terminal, desktop: hold.desktop })
    else log(`kept the live previews of ${target.slug}: a surface failed`)
  })
  failed += await replaceLivePreviews(held, deps)
  return failed === 0 ? 0 : 1
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error))

/** Asks the operator once about every live version's held results; returns how many steps failed. */
async function replaceLivePreviews(held: Held[], deps: RenderModsDeps): Promise<number> {
  const log = (line: string) => deps.log(terminalLine(line))
  let failed = 0
  const reviewed: Held[] = []
  const lines: string[] = []
  for (const hold of [...held].sort((a, b) => a.target.slug.localeCompare(b.target.slug))) {
    const { target, terminal, desktop } = hold
    try {
      const review = {
        pin: { slug: target.slug, versionId: target.versionId, commitSha: target.commitSha },
        readme: await deps.github.readme(target.repoUrl, target.path, target.commitSha),
        terminal: terminal.segments,
        desktopPng: desktop.kind === 'shot' ? desktop.png : null,
      }
      lines.push(...previewReviewLines(review, deps.writePng).map(terminalLine))
      reviewed.push(hold)
    } catch (error) {
      failed++
      log(`failed ${target.slug} review: ${message(error)}`)
    }
  }
  if (reviewed.length === 0) return failed

  const slugs = reviewed.map((hold) => hold.target.slug)
  const answer = await deps.review(lines, terminalLine(replaceQuestion(slugs)))
  const parsed = parseReplaceAnswer(answer, slugs)
  if ('unknown' in parsed) {
    log(`replaced none: did not recognise ${parsed.unknown.map((slug) => `"${slug}"`).join(', ')}`)
  }
  const replace = 'replace' in parsed ? parsed.replace : []
  for (const { target, terminal, desktop } of reviewed) {
    if (!replace.includes(target.slug)) {
      log(`kept the live previews of ${target.slug}`)
      continue
    }
    try {
      const results = storeResults(deps.db, target.versionId)
      await results.terminal(terminal)
      await results.desktop(desktop)
      log(`replaced the live previews of ${target.slug}`)
    } catch (error) {
      failed++
      log(`failed to replace the live previews of ${target.slug}: ${message(error)}`)
    }
  }
  return failed
}

/** One question on a terminal; anywhere else the answer is none, so nothing replaces unreviewed. */
async function askInTerminal(lines: string[], question: string): Promise<string> {
  for (const line of lines) console.log(line)
  if (!process.stdin.isTTY) {
    console.log(
      `${question} n: stdin is not a terminal, so the live previews stay. Rerun render:mods in a terminal to review them.`,
    )
    return ''
  }
  const prompt = createInterface({ input: process.stdin, output: process.stdout })
  try {
    return await prompt.question(`${question} `)
  } finally {
    prompt.close()
  }
}

async function main(): Promise<number> {
  const { values } = parseArgs({ options: { slug: { type: 'string' } }, strict: true })
  const url = requireEnv('DATABASE_URL')
  requireEnv('E2B_API_KEY')
  const client = postgres(url, isPooledUrl(url) ? { prepare: false } : {})
  const db = drizzle({ client, schema }) as unknown as Db
  try {
    return await renderMods(values, {
      db,
      recorder: e2bModRecorder,
      desktopRecorder: e2bDesktopRecorder(),
      github: createGitHub(),
      log: (line) => console.log(line),
      review: askInTerminal,
      writePng: writeTmpPng,
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
