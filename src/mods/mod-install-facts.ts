import { CircleHelp, Info, Puzzle, ShieldCheck } from 'lucide-react'
import type { PageCopy } from '@/content/types'
import type { ModFootprint } from '@/db/schema'
import { listPhrase } from '@/gallery/why-line'
import { utcDateLabel } from '@/lib/date-label'
import type { FoldedFacts, InstallFact } from '@/ui/install-facts'
import { describeFootprint, footprintRecorded } from './footprint'
import { SHORT_SHA_LENGTH } from './mod-fact-tiles'
import type { ModDetail } from './queries'

const capitalized = (phrase: string) => phrase.charAt(0).toUpperCase() + phrase.slice(1)

const power = (phrase: string, caution = false): InstallFact => ({
  icon: Puzzle,
  text: capitalized(phrase),
  caution,
})

const fold = (summary: string, facts: InstallFact[]): FoldedFacts | null =>
  facts.length > 0 ? { summary, facts } : null

/** A mod page's install panel: `facts` in sight, `more` and `notes` folded (null when empty). */
export interface ModInstallFacts {
  facts: InstallFact[]
  more: FoldedFacts | null
  notes: FoldedFacts | null
}

/**
 * What a mod page says beside its install button, in the validator footprint's own plain words
 * (so it shows for every mod, with or without page copy). In sight: that this commit was reviewed,
 * every risk its hooks take, and the entries those words don't cover yet. Folded: its plain powers,
 * then the copy's good-to-know notes. An empty footprint reads as not recorded, never as doing
 * nothing.
 */
export function modInstallFacts(
  mod: Pick<ModDetail, 'footprint' | 'commitSha' | 'reviewedAt'> & {
    generatedContent: Pick<PageCopy, 'goodToKnow'> | null
  },
): ModInstallFacts {
  const reviewed = `Reviewed at commit \`${mod.commitSha.slice(0, SHORT_SHA_LENGTH)}\``
  const { phrases, risks, unknown } = describeFootprint(mod.footprint)
  const undescribed: InstallFact[] =
    unknown.length > 0
      ? [
          {
            icon: CircleHelp,
            text: `${phrases.length > 0 ? 'Also uses' : 'Uses'} ${listPhrase(unknown.map((entry) => `\`${entry}\``))}, which this page doesn't describe yet`,
            caution: true,
          },
        ]
      : []
  const inSight: InstallFact[] = [
    ...(footprintRecorded(mod.footprint)
      ? risks.map((phrase) => power(phrase, true))
      : [{ icon: CircleHelp, text: "What it can reach isn't recorded yet", caution: true }]),
    ...undescribed,
  ]
  const plain = phrases.filter((phrase) => !risks.includes(phrase))
  const notes = mod.generatedContent?.goodToKnow ?? []
  // "More" only when a power is in sight above the fold.
  const things = `${inSight.length > 0 ? 'more ' : ''}${plain.length === 1 ? 'thing' : 'things'}`
  return {
    facts: [
      {
        icon: ShieldCheck,
        text: mod.reviewedAt ? `${reviewed}, ${utcDateLabel(mod.reviewedAt)}` : reviewed,
      },
      ...inSight,
    ],
    more: fold(
      `${plain.length} ${things} it can do`,
      plain.map((phrase) => power(phrase)),
    ),
    notes: fold(
      `Good to know (${notes.length})`,
      notes.map((note) => ({ icon: Info, text: note })),
    ),
  }
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
