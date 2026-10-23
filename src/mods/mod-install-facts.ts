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
 * The home hero's one short line on a mod's risks: "Can" and the short names of its first two,
 * weightiest first, then how many more its page lists, the entries it can't describe counted as
 * one. Null when it takes no risk and uses nothing undescribed; an unrecorded footprint says so.
 */
export function modReachSentence(footprint: ModFootprint): InstallFact | null {
  if (!footprintRecorded(footprint))
    return { icon: CircleHelp, text: "What it can reach isn't recorded yet", caution: true }
  const { shortRisks, unknown } = describeFootprint(footprint)
  const named = shortRisks.slice(0, 2)
  const more = shortRisks.length - named.length + (unknown.length > 0 ? 1 : 0)
  if (named.length === 0)
    return more > 0
      ? { icon: CircleHelp, text: "Can do things its page doesn't describe yet", caution: true }
      : null
  const text = `Can ${named.join(' and ')}${more > 0 ? `, +${more} more` : ''}`
  return { icon: Puzzle, text, caution: true }
}
