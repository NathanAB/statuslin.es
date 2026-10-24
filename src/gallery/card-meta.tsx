import { topicTags } from '@/gallery/config-badges'
import { FACET_BY_SLUG, facetLabel, tagHref } from '@/gallery/facets'
import { RowFacts } from '@/ui/gallery-row'
import { installsLabel } from '@/ui/install-count'
import { TextLink } from '@/ui/text'

export function CardMeta({
  kind,
  tags,
  copyCount,
}: {
  kind?: string
  tags: string[]
  copyCount: number
}) {
  return (
    <RowFacts>
      {[
        ...(kind ? [kind] : []),
        ...topicTags(tags).map((slug) =>
          FACET_BY_SLUG.get(slug)?.page ? (
            <TextLink key={slug} {...tagHref(slug)} tone="muted">
              {facetLabel(slug)}
            </TextLink>
          ) : (
            facetLabel(slug)
          ),
        ),
        installsLabel(copyCount),
      ]}
    </RowFacts>
  )
}
