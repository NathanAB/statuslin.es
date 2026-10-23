import type { FaqEntry } from '@/lib/json-ld'
import { type Facet, tagLabel } from './facets'

/** A facet's short name, in its breadcrumb and among the topics: "Git", "Tokens". */
export function facetTopicName(facet: Facet): string {
  return tagLabel(facet.chipLabel)
}

/** A facet page's common questions: its how-to answer first, then its FAQ. */
export function facetQuestions(facet: Facet): FaqEntry[] {
  return [...(facet.answer ? [facet.answer] : []), ...(facet.faq ?? [])]
}
