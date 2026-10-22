import type { ModFootprint } from '@/db/schema'
import type { AnsiSegment } from '@/render/types'
import { type EntryMeaning, FOOTPRINT_MEANINGS, type MatcherArgs } from './footprint-meanings'
import type { DesktopPreview } from './queries'

/** Where a mod's output appears in Claude Code, in display order. */
export const DRAW_LOCATIONS = [
  'above-prompt',
  'under-prompt',
  'pane',
  'status-entry',
  'toast',
  'built-in-rows',
] as const
export type DrawLocation = (typeof DRAW_LOCATIONS)[number]

export const DRAW_LOCATION_LABEL: Record<DrawLocation, string> = {
  'above-prompt': 'above the prompt',
  'under-prompt': 'under the prompt',
  pane: 'a pane',
  'status-entry': 'a status entry',
  toast: 'a toast',
  'built-in-rows': 'built-in rows',
}

export type Surface = 'terminal' | 'desktop'

export const SURFACE_LABEL: Record<Surface, string> = {
  terminal: 'Terminal',
  desktop: 'Claude Desktop',
}

const MEANING_RANK = new Map([...FOOTPRINT_MEANINGS.keys()].map((key, i) => [key, i]))

/** A footprint entry split into its name and its matcher arguments. */
export function parseEntry(entry: string): { name: string; args: MatcherArgs } {
  const match = /^([^{]+)(?:\{(.*)\})?$/.exec(entry)
  const name = match?.[1] ?? entry
  const args: MatcherArgs = {}
  for (const pair of match?.[2]?.split(', ') ?? []) {
    const eq = pair.indexOf('=')
    if (eq > 0) args[pair.slice(0, eq)] = pair.slice(eq + 1)
  }
  return { name, args }
}

function meaningOf(name: string, args: MatcherArgs): { key: string; meaning: EntryMeaning } | null {
  const namespace = name.slice(0, name.lastIndexOf('.'))
  const keys = [
    ...Object.entries(args).map(([k, v]) => `${name}{${k}=${v}}`),
    name,
    `${namespace}.*`,
  ]
  for (const key of keys) {
    const meaning = FOOTPRINT_MEANINGS.get(key)
    if (meaning) return { key, meaning }
  }
  return null
}

export interface FootprintDescription {
  phrases: string[]
  /** The phrases that name a risk to weigh, in the same order. */
  risks: string[]
  unknown: string[]
  draws: DrawLocation[]
}

/** Whether the validator recorded anything: an empty footprint was never recorded, which is not
 *  the same as a mod that does nothing. */
export function footprintRecorded(footprint: ModFootprint): boolean {
  return footprint.events.length + footprint.calls.length > 0
}

export function describeFootprint(footprint: ModFootprint): FootprintDescription {
  const ranked = new Map<string, number>()
  const risky = new Set<string>()
  const unknown: string[] = []
  const draws = new Set<DrawLocation>()
  for (const entry of [...footprint.events, ...footprint.calls]) {
    const { name, args } = parseEntry(entry)
    const found = meaningOf(name, args)
    if (!found) {
      unknown.push(entry)
      continue
    }
    const { key, meaning } = found
    if (meaning.draws) draws.add(meaning.draws)
    const phrase = typeof meaning.phrase === 'function' ? meaning.phrase(args) : meaning.phrase
    const rank = MEANING_RANK.get(key) ?? Number.MAX_SAFE_INTEGER
    if (phrase !== null && !ranked.has(phrase)) ranked.set(phrase, rank)
    if (phrase !== null && meaning.risk) risky.add(phrase)
  }
  const phrases = [...ranked].sort((a, b) => a[1] - b[1]).map(([phrase]) => phrase)
  return {
    phrases,
    risks: phrases.filter((phrase) => risky.has(phrase)),
    unknown,
    draws: DRAW_LOCATIONS.filter((location) => draws.has(location)),
  }
}

/** What a version's previews recorded. Only a Desktop result's kind matters here. */
interface RecordedSurfaces {
  preview: AnsiSegment[] | null
  desktop: Pick<DesktopPreview, 'kind'> | null
}

/** The surfaces the recorded previews show it drawing on; one where it drew nothing is left out. */
function modSurfaces(version: RecordedSurfaces): Surface[] {
  const surfaces: Surface[] = []
  if (version.preview !== null && version.preview.length > 0) surfaces.push('terminal')
  if (version.desktop?.kind === 'shot') surfaces.push('desktop')
  return surfaces
}

export interface ModFootprintDescription extends FootprintDescription {
  surfaces: Surface[]
}

/** A version's footprint in plain words, plus the surfaces it renders on. */
export function describeModFootprint(
  version: RecordedSurfaces & { footprint: ModFootprint },
): ModFootprintDescription {
  return { ...describeFootprint(version.footprint), surfaces: modSurfaces(version) }
}
