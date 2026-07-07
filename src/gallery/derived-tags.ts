import { coerceInterpreter } from '@/gallery/card-rows'
import { ALL_TAG_SLUGS } from '@/gallery/facets'

/** The tags implied by a config's current version: its interpreter, plus network-access
 * and reads-token when the version declares them. All are `source: 'derived'` registry slugs. */
export function deriveCapabilityTags(input: {
  interpreter: string
  networkHosts: string[]
  readsClaudeToken: boolean
}): string[] {
  const tags: string[] = [coerceInterpreter(input.interpreter)]
  if (input.networkHosts.length > 0) tags.push('network-access')
  if (input.readsClaudeToken) tags.push('reads-token')
  return tags
}

/** Union of curated + derived slugs, de-duplicated and ordered by the registry so badges
 * render in a stable order. Unknown slugs (shouldn't occur) are dropped. */
export function mergeTags(curated: string[], derived: string[]): string[] {
  const present = new Set([...curated, ...derived])
  return ALL_TAG_SLUGS.filter((slug) => present.has(slug))
}

/** The materialized `configs.allTags` value for a config: curated tags ∪ derived capability tags. */
export function computeAllTags(input: {
  curatedTags: string[]
  interpreter: string
  networkHosts: string[]
  readsClaudeToken: boolean
}): string[] {
  return mergeTags(input.curatedTags, deriveCapabilityTags(input))
}
