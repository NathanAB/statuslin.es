import { CircleHelp, Info, Puzzle, ShieldCheck } from 'lucide-react'
import type { PageCopy } from '@/content/types'
import type { ModFootprint } from '@/db/schema'
import { listPhrase } from '@/gallery/why-line'
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

/**
 * The home hero's one sentence on a mod, after its name: what its hooks can do that's worth weighing,
 * else its first two powers, in the footprint's words. Short powers are listed together; a power
 * that already joins two clauses with "and" would run on, so only the weightiest is said and the
 * page is named for the rest. Null when it names nothing, since an empty list must never read as
 * "does nothing"; an unrecorded footprint says so.
 */
export function modReachSentence(footprint: ModFootprint): InstallFact | null {
  if (!footprintRecorded(footprint))
    return { icon: CircleHelp, text: 'has no record yet of what it can reach.', caution: true }
  const { phrases, risks } = describeFootprint(footprint)
  const shown = risks.length > 0 ? risks : phrases.slice(0, 2)
  const [first] = shown
  if (first === undefined) return null
  const runsOn = shown.length > 1 && shown.some((phrase) => phrase.includes(' and '))
  const text = runsOn
    ? `${first}. Its page lists ${shown.length - 1} more.`
    : `${listPhrase(shown)}.`
  return { icon: Puzzle, text, caution: risks.length > 0 }
}
