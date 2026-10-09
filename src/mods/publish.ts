import type { ModFootprint, ModStatus } from '@/db/schema'
import { MOD_SCENARIO_KEY } from './queries'

export interface Guard {
  level: 'refuse' | 'warn'
  name: string
  message: string
}

export interface PublishVersion {
  commitSha: string
  pluginVersion: string | null
  footprint: ModFootprint
  rendered: boolean
}

/** Gathered from the database and GitHub up front so every guard stays a pure function. */
export interface PublishFacts {
  slug: string
  modStatus: ModStatus
  target: PublishVersion
  current: PublishVersion | null
  onDefaultBranch: boolean
  /** Files changed since the current version's commit; null on a first publish. */
  filesChanged: string[] | null
}

const COMMIT_SHA = /^[0-9a-f]{40}$/

export function shaGuards(sha: string): Guard[] {
  if (COMMIT_SHA.test(sha)) return []
  return [
    {
      level: 'refuse',
      name: 'sha-format',
      message: `"${sha}" is not a full commit SHA (40 lowercase hex characters)`,
    },
  ]
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
  return [
    { level: 'warn', name: 'footprint-grows', message: `the footprint ${additions.join(' and ')}` },
  ]
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
    {
      level: 'warn',
      name: 'plugin-version-unchanged',
      message: `plugin.json version ${target.pluginVersion} is unchanged, so existing installs won't update`,
    },
  ]
}

interface Refusal {
  name: string
  refuses: (facts: PublishFacts) => boolean
  message: (facts: PublishFacts) => string
}

const REFUSALS: Refusal[] = [
  {
    name: 'mod-removed',
    refuses: (f) => f.modStatus === 'removed',
    message: (f) => `"${f.slug}" is delisted; bring it back with delist-mod.ts --restore first`,
  },
  {
    name: 'not-on-default-branch',
    refuses: (f) => !f.onDefaultBranch,
    message: (f) => `commit ${f.target.commitSha} is not on the repository's default branch`,
  },
  {
    name: 'not-rendered',
    refuses: (f) => !f.target.rendered,
    message: (f) =>
      `the version at ${f.target.commitSha} has not rendered (no ${MOD_SCENARIO_KEY} preview or Desktop screenshot)`,
  },
]

export function publishGuards(facts: PublishFacts): Guard[] {
  const refusals = REFUSALS.filter((r) => r.refuses(facts)).map(
    (r): Guard => ({ level: 'refuse', name: r.name, message: r.message(facts) }),
  )
  return [...refusals, ...footprintGuards(facts), ...pluginVersionGuards(facts)]
}

const CONFIRM_FLAG = '--confirm='

export function confirmationGuards(slug: string, argv: string[]): Guard[] {
  const confirm = argv.find((a) => a.startsWith(CONFIRM_FLAG))?.slice(CONFIRM_FLAG.length)
  if (confirm === slug) return []
  return [
    {
      level: 'refuse',
      name: 'confirmation',
      message: `type the slug back to confirm: ${CONFIRM_FLAG}${slug}`,
    },
  ]
}

function footprintLine(label: string, footprint: ModFootprint | null): string {
  if (!footprint) return `footprint ${label}: none (first publish)`
  return `footprint ${label}: events ${bracketed(footprint.events)} calls ${bracketed(footprint.calls)}`
}

export function publishReport(facts: PublishFacts): string[] {
  const files =
    facts.filesChanged === null
      ? ['files changed: none to compare (first publish)']
      : [
          `files changed (${facts.filesChanged.length}):`,
          ...facts.filesChanged.map((f) => `  ${f}`),
        ]
  return [
    `${facts.slug}: ${facts.current?.commitSha ?? 'unpublished'} → ${facts.target.commitSha}`,
    ...files,
    footprintLine('before', facts.current?.footprint ?? null),
    footprintLine('after', facts.target.footprint),
  ]
}

export function guardLine(guard: Guard): string {
  return `${guard.level === 'refuse' ? 'REFUSE' : 'WARN'} ${guard.name}: ${guard.message}`
}
