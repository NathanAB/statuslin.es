import { z } from 'zod'
import { type EntriesResult, entryLabel, parseEntries, pinnedPluginFields } from './curation'

/**
 * Relative to the repo root. The only source of which unreviewed mods exist (ADR 0011):
 * `bun run import:unreviewed-mods` makes the unreviewed_mods table match it.
 */
export const UNREVIEWED_FILE = 'src/mods/unreviewed.json'

const entrySchema = z.strictObject(pinnedPluginFields)

export type UnreviewedEntry = z.infer<typeof entrySchema>

/** The repository owner in a checked https://github.com/<owner>/<repo> URL. */
export function repoOwner(repoUrl: string): string {
  return new URL(repoUrl).pathname.split('/')[1] ?? ''
}

/** One page per owner and plugin name, as the table's unique index has it, and per plugin folder. */
function duplicates(entries: UnreviewedEntry[]): string[] {
  const byName = new Map<string, number>()
  const byFolder = new Map<string, number>()
  return entries.flatMap((entry, index) => {
    const name = `${repoOwner(entry.repoUrl).toLowerCase()}/${entry.pluginName}`
    const folder = `${entry.repoUrl} at ${entry.path || 'its root'}`
    const sameName = byName.get(name)
    const sameFolder = byFolder.get(folder)
    byName.set(name, byName.get(name) ?? index)
    byFolder.set(folder, byFolder.get(folder) ?? index)
    if (sameName !== undefined) {
      return [`${entryLabel(entry, index)}: ${name} is already entry ${sameName + 1}`]
    }
    if (sameFolder !== undefined) {
      return [`${entryLabel(entry, index)}: ${folder} is already entry ${sameFolder + 1}`]
    }
    return []
  })
}

export function parseUnreviewed(raw: unknown): EntriesResult<UnreviewedEntry> {
  return parseEntries(raw, { file: UNREVIEWED_FILE, schema: entrySchema, duplicates })
}
