import type { ModFootprint } from '@/db/schema'
import { bracketed, type PublishFacts, type PublishVersion, sourceLabel } from './publish'

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
