import { FACET_MOD_COPY, type FacetModCopy } from './facet-copy'
import { FACET_BY_SLUG, type Facet, tagLabel } from './facets'

/** A facet page's title, heading and description: the mod copy while the page lists a mod. */
export function facetPageCopy(
  facet: Facet,
  modCount: number,
): FacetModCopy & { listsMods: boolean } {
  const withMods = FACET_MOD_COPY[facet.slug]
  if (withMods && modCount > 0) return { ...withMods, listsMods: true }
  return {
    titleBase: facet.titleBase ?? '',
    heading: facet.heading ?? '',
    metaDescription: facet.metaDescription ?? '',
    listsMods: false,
  }
}

/** A facet's short name, in its breadcrumb and among the topics: "Git", "Tokens". */
export function facetTopicName(facet: Facet): string {
  return tagLabel(facet.chipLabel)
}

/** A topic's heading on the hub: its page's own, which names mods while the page lists one. */
export function topicHeading(topic: { slug: string; mods: number }): string {
  const facet = FACET_BY_SLUG.get(topic.slug)
  return facet ? facetPageCopy(facet, topic.mods).heading : topic.slug
}
