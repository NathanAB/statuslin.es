import { and, eq, not } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import * as schema from '@/db/schema'
import { STATUSLINE_ANYWHERE_MOD_SLUG } from '@/lib/statusline-anywhere'
import {
  type ModContentGenerationResponse,
  parseModContentGenerationResponses,
} from '@/mods/content-generation'
import { CURATION_FILE, type CurationEntry } from '@/mods/curation'
import { hasSubmission } from '@/mods/import'

/**
 * The "Re-pin a mod" runbook (docs/deploy.md) for several mods in one process, so one
 * `bun run with-env <env>` decrypt covers every step. run-repin-mods.ts wires it to the database,
 * E2B and the operator's agent; this file holds what it decides.
 */

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

export interface Repin {
  slug: string
  commitSha: string
}

/** The steps the runbook runs, each with the exit code its own script would return. */
export interface RepinSteps {
  importMods: () => Promise<number>
  renderMod: (slug: string) => Promise<number>
  publishMod: (argv: string[], log: (line: string) => void) => Promise<number>
  /** The `--all --prepare --mod` request batch, as JSON. */
  prepareContent: () => Promise<string>
  applyContent: (responses: string) => Promise<void>
  /** Re-records status line Desktop shots made with an older statusline-anywhere commit. */
  renderStatusLineDesktop: () => Promise<number>
}

export interface RepinIo {
  log: (line: string) => void
  /** Hands the page-copy requests to the agent. */
  sendRequests: (json: string) => Promise<void>
  /** Waits for the next answer: the typed confirmation, then the page-copy responses. */
  readInput: (prompt: string) => Promise<string>
}

/** `with-env <env>` sets APP_ENV, so a mismatch means the wrong env file was decrypted. */
export function assertAppEnv(named: string, appEnv: string | undefined): void {
  if (appEnv !== named) {
    throw new Error(
      `APP_ENV is ${appEnv ?? 'unset'}, not ${named}: run it as bun run with-env ${named} scripts/run-repin-mods.ts ${named}`,
    )
  }
}

/**
 * Publishes only a curation file a human merged: updates:mods moves pins in the working copy, and
 * those commits haven't been reviewed until their pull request is merged into main.
 */
export function assertCurationReviewed(onDisk: string, onMain: string | null): void {
  if (onDisk !== onMain) {
    throw new Error(
      `${CURATION_FILE} is not the reviewed one on origin/main: merge its pull request, then git pull and rerun`,
    )
  }
}

/**
 * Each published curated mod whose curation entry pins a commit other than its live one, matched
 * the way import-mods.ts re-pins: same plugin name, live version from the same repository, and no
 * user submission. `slugs`, when given, narrows the list and must all be in it.
 */
export async function repinsToRun(
  db: Db,
  entries: CurationEntry[],
  slugs: string[],
): Promise<Repin[]> {
  const live = await db
    .select({
      slug: schema.mods.slug,
      pluginName: schema.mods.pluginName,
      repoUrl: schema.modVersions.repoUrl,
      commitSha: schema.modVersions.commitSha,
    })
    .from(schema.mods)
    .innerJoin(schema.modVersions, eq(schema.modVersions.id, schema.mods.currentVersionId))
    .where(and(eq(schema.mods.status, 'published'), not(hasSubmission(db))))
  const stale = entries.flatMap((entry) => {
    const mod = live.find((m) => m.pluginName === entry.pluginName && m.repoUrl === entry.repoUrl)
    return mod && mod.commitSha !== entry.commitSha
      ? [{ slug: mod.slug, commitSha: entry.commitSha }]
      : []
  })
  if (slugs.length === 0) return stale
  const missing = slugs.filter((slug) => !stale.some((r) => r.slug === slug))
  if (missing.length > 0) {
    throw new Error(
      `nothing to re-pin for ${missing.join(', ')}: not a published curated mod, or curation.json pins its live commit`,
    )
  }
  return stale.filter((r) => slugs.includes(r.slug))
}

export const confirmationPhrase = (env: string, count: number) => `publish ${count} to ${env}`
const copyConfirmationPhrase = (env: string, count: number) => `apply copy for ${count} on ${env}`

/** Returns 0 when every mod published and its page copy applied, 1 when a step stopped the run. */
export async function runRepin(
  env: string,
  repins: Repin[],
  steps: RepinSteps,
  io: RepinIo,
): Promise<number> {
  if (repins.length === 0) {
    io.log('nothing to re-pin: every curated mod is live at its pinned commit')
    return 0
  }
  io.log(`re-pinning on ${env}: ${repins.map((r) => `${r.slug} → ${r.commitSha}`).join(', ')}`)

  if ((await steps.importMods()) !== 0) return stop(io, 'the import refused an entry')
  for (const { slug } of repins) {
    if ((await steps.renderMod(slug)) !== 0) return stop(io, `${slug} did not render`)
  }

  const warnings: string[] = []
  for (const { slug, commitSha } of repins) {
    const log = (line: string) => {
      io.log(line)
      if (line.startsWith('WARN')) warnings.push(`${slug}: ${line}`)
    }
    if ((await steps.publishMod([slug, commitSha], log)) !== 0) {
      return stop(io, `the ${slug} dry run refused`)
    }
  }
  io.log(warnings.length > 0 ? 'WARN lines from the dry runs:' : 'the dry runs gave no warnings')
  for (const line of warnings) io.log(`  ${line}`)

  const phrase = confirmationPhrase(env, repins.length)
  const typed = await io.readInput(`to publish, type: ${phrase}`)
  if (typed.trim() !== phrase) return stop(io, `the confirmation was not "${phrase}"`)
  for (const { slug, commitSha } of repins) {
    const argv = [slug, commitSha, '--apply', `--confirm=${slug}`]
    if ((await steps.publishMod(argv, io.log)) !== 0) return stop(io, `${slug} did not publish`)
  }

  return afterPublish(env, repins, steps, io)
}

/** Page copy for the newly current versions, then the Desktop shots if statusline-anywhere moved. */
async function afterPublish(
  env: string,
  repins: Repin[],
  steps: RepinSteps,
  io: RepinIo,
): Promise<number> {
  const requests = await steps.prepareContent()
  if ((JSON.parse(requests) as unknown[]).length === 0) {
    io.log('every mod has page copy')
  } else {
    await io.sendRequests(requests)
    const copied = await approvePageCopy(env, steps, io)
    if (copied !== 0) return copied
  }

  // Every status line's Desktop shot is drawn by statusline-anywhere, so re-pinning it dates them all.
  if (!repins.some((r) => r.slug === STATUSLINE_ANYWHERE_MOD_SLUG)) return 0
  if ((await steps.renderStatusLineDesktop()) === 0) return 0
  return stop(io, 'a status line Desktop shot failed to record; rerun render:status-line-desktop')
}

/** Visitors read the copy on the mod page, so a human sees it before it is applied. */
async function approvePageCopy(env: string, steps: RepinSteps, io: RepinIo): Promise<number> {
  const raw = await io.readInput('send the page-copy response JSON')
  let responses: ModContentGenerationResponse[]
  try {
    responses = parseModContentGenerationResponses(raw)
  } catch (error) {
    return stop(
      io,
      `the page copy failed validation: ${error instanceof Error ? error.message : error}`,
    )
  }
  for (const line of pageCopyLines(responses)) io.log(line)
  const phrase = copyConfirmationPhrase(env, responses.length)
  const typed = await io.readInput(`to apply this page copy, type: ${phrase}`)
  if (typed.trim() !== phrase) return stop(io, `the page-copy confirmation was not "${phrase}"`)
  await steps.applyContent(raw)
  return 0
}

function pageCopyLines(responses: ModContentGenerationResponse[]): string[] {
  return responses.flatMap(({ slug, commitSha, generatedContent: copy, tags }) => [
    `page copy for ${slug} at ${commitSha.slice(0, 7)}:`,
    `  summary: ${copy.summary}`,
    ...copy.howItWorks.map((step, index) => `  how it works ${index + 1}: ${step}`),
    ...copy.goodToKnow.map((note) => `  good to know: ${note}`),
    ...Object.entries(copy.details).map(
      ([tile, wording]) => `  ${tile}: ${Array.isArray(wording) ? wording.join(', ') : wording}`,
    ),
    `  tags: ${tags.length > 0 ? tags.join(', ') : 'none'}`,
  ])
}

function stop(io: RepinIo, reason: string): number {
  io.log(`stopped: ${reason}; nothing after it ran`)
  return 1
}
