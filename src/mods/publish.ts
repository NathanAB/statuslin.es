import { and, eq, type SQL, sql } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { type ModFootprint, type ModStatus, modVersions } from '@/db/schema'
import { COMMIT_SHA } from './curation'
import { MOD_SCENARIO_KEY, versionIsRendered } from './queries'

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

export interface Guard {
  level: 'refuse' | 'warn'
  name: string
  message: string
}

const refuse = (name: string, message: string): Guard => ({ level: 'refuse', name, message })
const warn = (name: string, message: string): Guard => ({ level: 'warn', name, message })

export interface PublishVersion {
  id: string
  repoUrl: string
  path: string
  commitSha: string
  pluginVersion: string | null
  footprint: ModFootprint
  rendered: boolean
}

export async function loadVersions(db: Db, where: SQL | undefined): Promise<PublishVersion[]> {
  return db
    .select({
      id: modVersions.id,
      repoUrl: modVersions.repoUrl,
      path: modVersions.path,
      commitSha: modVersions.commitSha,
      pluginVersion: modVersions.pluginVersion,
      footprint: modVersions.footprint,
      rendered: sql<boolean>`${versionIsRendered}`,
    })
    .from(modVersions)
    .where(where)
}

/**
 * Scoped to the mod. A current_version_id pointing at another mod's version is refused, so it is
 * never mistaken for a first publish with nothing to compare against.
 */
export async function loadCurrentVersion(
  db: Db,
  mod: { id: string; currentVersionId: string | null },
): Promise<PublishVersion | null> {
  if (!mod.currentVersionId) return null
  const [current] = await loadVersions(
    db,
    and(eq(modVersions.id, mod.currentVersionId), eq(modVersions.modId, mod.id)),
  )
  if (!current) {
    throw new Error(`current_version_id ${mod.currentVersionId} is not a version of this mod`)
  }
  return current
}

/** What any version must satisfy before the marketplace lists it, by publish or by restore. */
export interface ListingFacts {
  target: PublishVersion
  onDefaultBranch: boolean
}

/** Gathered from the database and GitHub up front so every guard stays a pure function. */
export interface PublishFacts extends ListingFacts {
  slug: string
  modStatus: ModStatus
  /** From plugin.json at import; the marketplace and llms.txt show it once the mod is published. */
  description: string
  current: PublishVersion | null
  /** Files changed since `compareBase`; null when there is no base to compare against. */
  filesChanged: string[] | null
}

/** GitHub compares commits only within one repository, so a move to another repo has no base. */
export function compareBase(
  current: PublishVersion | null,
  target: PublishVersion,
): PublishVersion | null {
  return current?.repoUrl === target.repoUrl ? current : null
}

export function shaGuards(sha: string): Guard[] {
  if (COMMIT_SHA.test(sha)) return []
  return [refuse('sha-format', `"${sha}" is not a full commit SHA (40 lowercase hex characters)`)]
}

function added(before: string[], after: string[]): string[] {
  return after.filter((item) => !before.includes(item))
}

function bracketed(items: string[]): string {
  return `[${items.join(', ')}]`
}

function footprintGuards({ current, target }: PublishFacts): Guard[] {
  if (!current) return []
  const events = added(current.footprint.events, target.footprint.events)
  const calls = added(current.footprint.calls, target.footprint.calls)
  const additions = [
    ...(events.length > 0 ? [`adds events ${bracketed(events)}`] : []),
    ...(calls.length > 0 ? [`adds $ calls ${bracketed(calls)}`] : []),
  ]
  if (additions.length === 0) return []
  return [warn('footprint-grows', `the footprint ${additions.join(' and ')}`)]
}

/**
 * Claude Code updates an installed plugin only when its computed version changes, and plugin.json's
 * `version` wins over the commit SHA. A null version falls through to the SHA, so only an unchanged
 * non-null version leaves existing installs behind.
 */
function pluginVersionGuards({ current, target }: PublishFacts): Guard[] {
  if (!current || target.pluginVersion === null) return []
  if (target.pluginVersion !== current.pluginVersion) return []
  return [
    warn(
      'plugin-version-unchanged',
      `plugin.json version ${target.pluginVersion} is unchanged, so existing installs won't update`,
    ),
  ]
}

export function sourceLabel(version: PublishVersion): string {
  return `${version.repoUrl} path ${JSON.stringify(version.path)}`
}

function sourceGuards({ current, target }: PublishFacts): Guard[] {
  if (!current || (current.repoUrl === target.repoUrl && current.path === target.path)) return []
  return [
    warn(
      'source-changed',
      `the plugin moves from ${sourceLabel(current)} to ${sourceLabel(target)}`,
    ),
  ]
}

const GITHUB_COMPARE_FILE_CAP = 300

function truncationGuards({ current, target, filesChanged }: PublishFacts): Guard[] {
  const base = compareBase(current, target)
  if (!base || filesChanged === null || filesChanged.length < GITHUB_COMPARE_FILE_CAP) return []
  return [
    warn(
      'files-truncated',
      `GitHub lists at most ${GITHUB_COMPARE_FILE_CAP} files; review the full diff at ${target.repoUrl}/compare/${base.commitSha}...${target.commitSha}`,
    ),
  ]
}

export function listingGuards({ target, onDefaultBranch }: ListingFacts): Guard[] {
  const offDefault = `commit ${target.commitSha} is not on the repository's default branch`
  const unrendered = `the version at ${target.commitSha} has not rendered on both surfaces (it needs a ${MOD_SCENARIO_KEY} result in the terminal and in Claude Desktop)`
  return [
    ...(onDefaultBranch ? [] : [refuse('not-on-default-branch', offDefault)]),
    ...(target.rendered ? [] : [refuse('not-rendered', unrendered)]),
  ]
}

export function removedGuard(slug: string): Guard {
  return refuse(
    'mod-removed',
    `"${slug}" is delisted; bring it back with delist-mod.ts --restore first`,
  )
}

export function alreadyCurrentGuard(slug: string, sha: string): Guard {
  return refuse('already-current', `"${slug}" is already published at ${sha}; nothing to publish`)
}

export function currentChangedGuard(slug: string): Guard {
  return refuse(
    'current-version-changed',
    `"${slug}" was published or re-pinned after this report was read; rerun to review the new diff`,
  )
}

export function publishGuards(facts: PublishFacts): Guard[] {
  return [
    ...(facts.modStatus === 'removed' ? [removedGuard(facts.slug)] : []),
    ...listingGuards(facts),
    ...sourceGuards(facts),
    ...truncationGuards(facts),
    ...footprintGuards(facts),
    ...pluginVersionGuards(facts),
  ]
}

const CONFIRM_FLAG = '--confirm='

export function confirmationGuards(slug: string, argv: string[]): Guard[] {
  const confirm = argv.find((a) => a.startsWith(CONFIRM_FLAG))?.slice(CONFIRM_FLAG.length)
  if (confirm === slug) return []
  return [refuse('confirmation', `type the slug back to confirm: ${CONFIRM_FLAG}${slug}`)]
}

export function refuses(guards: Guard[]): boolean {
  return guards.some((g) => g.level === 'refuse')
}

function footprintLine(label: string, footprint: ModFootprint | null): string {
  if (!footprint) return `footprint ${label}: none (first publish)`
  return `footprint ${label}: events ${bracketed(footprint.events)} calls ${bracketed(footprint.calls)}`
}

function sourceLine(label: string, version: PublishVersion | null): string {
  return `source ${label}: ${version ? sourceLabel(version) : 'none (first publish)'}`
}

function filesLines({ current, filesChanged }: PublishFacts): string[] {
  if (filesChanged !== null) {
    return [`files changed (${filesChanged.length}):`, ...filesChanged.map((f) => `  ${f}`)]
  }
  return [
    `files changed: none to compare (${current ? 'the repository changed' : 'first publish'})`,
  ]
}

/** The lines carry author text unescaped; print each through `terminalLine`. */
export function publishReport(facts: PublishFacts): string[] {
  return [
    `${facts.slug}: ${facts.current?.commitSha ?? 'unpublished'} → ${facts.target.commitSha}`,
    `description: ${facts.description || 'none'}`,
    sourceLine('before', facts.current),
    sourceLine('after', facts.target),
    ...filesLines(facts),
    footprintLine('before', facts.current?.footprint ?? null),
    footprintLine('after', facts.target.footprint),
  ]
}

export function guardLine(guard: Guard): string {
  return `${guard.level === 'refuse' ? 'REFUSE' : 'WARN'} ${guard.name}: ${guard.message}`
}
