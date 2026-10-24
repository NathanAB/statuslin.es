import { eq, type SQL, sql } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { type ModFootprint, type ModStatus, modVersions } from '@/db/schema'
import { mergeTags } from '@/lib/derived-tags'
import { COMMIT_SHA } from './curation'
import type { CommitComparison } from './github'
import { MOD_SCENARIO_KEY, versionIsRendered } from './queries'

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

/** A mod's tags plus the one its footprint implies, as the gallery's badges and filters read them. */
export function modAllTags(tags: string[], footprint: ModFootprint): string[] {
  return mergeTags(tags, footprint.calls.includes('$.http.fetch') ? ['network-access'] : [])
}

/** `description` is the target's plugin.json description, so the listing describes the live version. */
export function publishedRow(
  target: PublishVersion,
  tags: string[],
  description: string,
): { currentVersionId: string; status: ModStatus; allTags: string[]; description: string } {
  return {
    currentVersionId: target.id,
    status: 'published',
    allTags: modAllTags(tags, target.footprint),
    description,
  }
}

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

export async function loadCurrentVersion(
  db: Db,
  mod: { currentVersionId: string | null },
): Promise<PublishVersion | null> {
  if (!mod.currentVersionId) return null
  const [current] = await loadVersions(db, eq(modVersions.id, mod.currentVersionId))
  if (!current) {
    throw new Error(`current_version_id ${mod.currentVersionId} names no version`)
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
  /**
   * The target's plugin.json description, which the marketplace and llms.txt show once it is
   * published; null when GitHub can't serve a readable plugin.json at the target commit.
   */
  description: string | null
  current: PublishVersion | null
  /** Files changed since `compareBase`; null when there is no base to compare against. */
  filesChanged: string[] | null
  comparedToLive: CommitComparison | null
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

export function bracketed(items: string[]): string {
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

function aheadOfLiveGuards({ current, target, comparedToLive }: PublishFacts): Guard[] {
  if (!current || comparedToLive === null || comparedToLive === 'ahead') return []
  const live = `the live commit ${current.commitSha}`
  const why = {
    behind: `is behind ${live}, so publishing it would roll users back`,
    diverged: `doesn't build on ${live}, so publishing it could drop changes users already have`,
    identical: `is ${live}`,
  }[comparedToLive]
  return [refuse('not-ahead-of-live', `commit ${target.commitSha} ${why}`)]
}

function descriptionGuards({ target, description }: PublishFacts): Guard[] {
  if (description !== null) return []
  return [
    refuse(
      'description-unreadable',
      `GitHub serves no readable plugin.json at ${target.commitSha}, so its description is unknown`,
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
    ...aheadOfLiveGuards(facts),
    ...descriptionGuards(facts),
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

export function guardLine(guard: Guard): string {
  return `${guard.level === 'refuse' ? 'REFUSE' : 'WARN'} ${guard.name}: ${guard.message}`
}
