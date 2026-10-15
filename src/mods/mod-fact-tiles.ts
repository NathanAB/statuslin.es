import {
  Coins,
  FilePen,
  GitCommitHorizontal,
  Globe,
  Monitor,
  PanelTop,
  SquareSlash,
  Terminal,
} from 'lucide-react'
import type { ModPageCopy } from '@/content/types'
import { listPhrase } from '@/gallery/why-line'
import type { FactTile } from '@/ui/fact-tiles'
import { DRAW_LOCATION_LABEL, describeModFootprint, SURFACE_LABEL } from './footprint'
import { type FootprintCommands, footprintFacts } from './footprint-facts'
import type { ModDetail } from './queries'

/** Each tile's label, also named by the guide that explains the tiles. */
export const MOD_TILE_LABEL = {
  showsUp: 'Shows up',
  worksIn: 'Works in',
  commands: 'Commands',
  usesYourPlan: 'Uses your plan',
  changesFiles: 'Changes files',
  network: 'Network',
  reviewedCommit: 'Reviewed commit',
  recordedWith: 'Recorded with',
} as const

/** How long a commit sha reads on a mod page: the byline's source link and the tile. */
export const SHORT_SHA_LENGTH = 7

const REVIEW_DATE = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
})

/** The pinned commit every published mod was reviewed at, and the date when one is stored. */
function reviewedCommitValue(commitSha: string, reviewedAt: string | null): string {
  const commit = `\`${commitSha.slice(0, SHORT_SHA_LENGTH)}\``
  return reviewedAt ? `${commit} on ${REVIEW_DATE.format(new Date(reviewedAt))}` : commit
}

/** A reach tile's value when the mod has that reach only through the programs it runs. */
export const THROUGH_PROGRAMS = 'Only through programs it runs'

const capitalized = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/** The footprint's command names; the copy's only when the footprint records some unnamed. */
function commandsValue(commands: FootprintCommands | null, fromCopy: string[] = []): string {
  if (commands === null) return 'None'
  const named = commands.names.map((name) => `/${name}`)
  const names = commands.unnamed ? [...new Set([...named, ...fromCopy])] : named
  return names.length > 0 ? names.map((name) => `\`${name}\``).join(', ') : 'Yes'
}

/** A reach the mod has itself, only through the programs it runs, or not at all. */
function reachValue(
  direct: boolean,
  runsPrograms: boolean,
  detail: string | undefined,
  none: string,
): string {
  if (direct) return detail ?? 'Yes'
  return runsPrograms ? (detail ?? THROUGH_PROGRAMS) : none
}

/**
 * A mod's fact tiles. Each yes or no comes from the validator's footprint or the recorded
 * previews; the page copy only words a tile whose fact is yes. The last tiles name the reviewed
 * commit and the Claude Code version the preview was recorded with.
 */
export function modFactTiles(
  mod: Pick<
    ModDetail,
    | 'footprint'
    | 'preview'
    | 'desktop'
    | 'generatedContent'
    | 'commitSha'
    | 'reviewedAt'
    | 'recordedWith'
  >,
): FactTile[] {
  const { draws, surfaces } = describeModFootprint(mod)
  const facts = footprintFacts(mod.footprint)
  const details: ModPageCopy['details'] = mod.generatedContent?.details ?? {}
  const showsUp =
    draws.length > 0
      ? (details.showsUp ?? capitalized(listPhrase(draws.map((d) => DRAW_LOCATION_LABEL[d]))))
      : 'Nothing on screen'
  const worksIn: FactTile[] =
    surfaces.length > 0
      ? [
          {
            icon: Monitor,
            label: MOD_TILE_LABEL.worksIn,
            value: listPhrase(surfaces.map((s) => SURFACE_LABEL[s])),
          },
        ]
      : []
  return [
    { icon: PanelTop, label: MOD_TILE_LABEL.showsUp, value: showsUp },
    ...worksIn,
    {
      icon: SquareSlash,
      label: MOD_TILE_LABEL.commands,
      value: commandsValue(facts.commands, details.commands),
    },
    {
      icon: Coins,
      label: MOD_TILE_LABEL.usesYourPlan,
      value: facts.callsModel ? (details.usesYourPlan ?? 'Yes') : 'No',
      caution: facts.callsModel,
    },
    {
      icon: FilePen,
      label: MOD_TILE_LABEL.changesFiles,
      value: reachValue(facts.writesFiles, facts.runsPrograms, details.changesFiles, 'Nothing'),
    },
    {
      icon: Globe,
      label: MOD_TILE_LABEL.network,
      value: reachValue(facts.usesNetwork, facts.runsPrograms, details.network, 'None'),
    },
    {
      icon: GitCommitHorizontal,
      label: MOD_TILE_LABEL.reviewedCommit,
      value: reviewedCommitValue(mod.commitSha, mod.reviewedAt),
    },
    ...(mod.recordedWith
      ? [
          {
            icon: Terminal,
            label: MOD_TILE_LABEL.recordedWith,
            value: `Claude Code ${mod.recordedWith}`,
          },
        ]
      : []),
  ]
}
