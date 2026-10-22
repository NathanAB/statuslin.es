import { type Facet, tagLabel } from './facets'

/** A facet's short name, in its breadcrumb and among the topics: "Git", "Tokens". */
export function facetTopicName(facet: Facet): string {
  return tagLabel(facet.chipLabel)
}
