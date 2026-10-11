import { Coins, FilePen, Globe, Monitor, PanelTop, SquareSlash } from 'lucide-react'
import type { ModPageCopy } from '@/content/types'
import { listPhrase } from '@/gallery/why-line'
import type { FactTile } from '@/ui/fact-tiles'
import { DRAW_LOCATION_LABEL, describeModFootprint, SURFACE_LABEL } from './footprint'
import { type FootprintCommands, footprintFacts } from './footprint-facts'
import type { ModDetail } from './queries'

const THROUGH_PROGRAMS = 'Only through programs it runs'

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
 * previews; the page copy only words a tile whose fact is yes.
 */
export function modFactTiles(
  mod: Pick<ModDetail, 'footprint' | 'preview' | 'desktop' | 'generatedContent'>,
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
            label: 'Works in',
            value: listPhrase(surfaces.map((s) => SURFACE_LABEL[s])),
          },
        ]
      : []
  return [
    { icon: PanelTop, label: 'Shows up', value: showsUp },
    ...worksIn,
    {
      icon: SquareSlash,
      label: 'Commands',
      value: commandsValue(facts.commands, details.commands),
    },
    {
      icon: Coins,
      label: 'Uses your plan',
      value: facts.callsModel ? (details.usesYourPlan ?? 'Yes') : 'No',
      caution: facts.callsModel,
    },
    {
      icon: FilePen,
      label: 'Changes files',
      value: reachValue(facts.writesFiles, facts.runsPrograms, details.changesFiles, 'Nothing'),
    },
    {
      icon: Globe,
      label: 'Network',
      value: reachValue(facts.usesNetwork, facts.runsPrograms, details.network, 'None'),
    },
  ]
}
