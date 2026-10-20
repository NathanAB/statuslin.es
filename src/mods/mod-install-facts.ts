import { CircleHelp, Info, Puzzle, ShieldCheck } from 'lucide-react'
import type { PageCopy } from '@/content/types'
import { utcDateLabel } from '@/lib/date-label'
import type { InstallFact } from '@/ui/install-facts'
import { describeFootprint, footprintRecorded } from './footprint'
import { SHORT_SHA_LENGTH } from './mod-fact-tiles'
import type { ModDetail } from './queries'

const capitalized = (phrase: string) => phrase.charAt(0).toUpperCase() + phrase.slice(1)

/**
 * What a mod page says beside its install button: that this commit was reviewed, then what its
 * hooks can do, in the validator footprint's own plain words (so it shows for every mod, with or
 * without page copy), then the copy's good-to-know notes. An empty footprint reads as not
 * recorded, never as doing nothing.
 */
export function modInstallFacts(
  mod: Pick<ModDetail, 'footprint' | 'commitSha' | 'reviewedAt'> & {
    generatedContent: Pick<PageCopy, 'goodToKnow'> | null
  },
): InstallFact[] {
  const reviewed = `Reviewed at commit \`${mod.commitSha.slice(0, SHORT_SHA_LENGTH)}\``
  const { phrases, risks } = describeFootprint(mod.footprint)
  const powers: InstallFact[] = footprintRecorded(mod.footprint)
    ? phrases
        .map((phrase) => ({
          icon: Puzzle,
          text: capitalized(phrase),
          caution: risks.includes(phrase),
        }))
        // The risks first, each group in the footprint's own order of weight.
        .sort((a, b) => Number(b.caution) - Number(a.caution))
    : [{ icon: CircleHelp, text: "What it can reach isn't recorded yet", caution: true }]
  return [
    {
      icon: ShieldCheck,
      text: mod.reviewedAt ? `${reviewed}, ${utcDateLabel(mod.reviewedAt)}` : reviewed,
    },
    ...powers,
    ...(mod.generatedContent?.goodToKnow ?? []).map((note) => ({ icon: Info, text: note })),
  ]
}
