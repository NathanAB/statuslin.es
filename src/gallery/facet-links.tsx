import { Link } from '@tanstack/react-router'
import { STATUS_LINES_PATH } from '@/lib/page-title'
import { MODS_PATH } from '@/lib/site'
import { Badge } from '@/ui/badge'
import { Row } from '@/ui/layout'
import { TextLink } from '@/ui/text'
import { facetTopicName } from './facet-page-copy'
import { FACETS } from './facets'

/**
 * A facet page's topics, under its heading: this facet and the other indexable ones in registry
 * order, this one marked as the current page, then a link to the hub that lists them all. The hub
 * link matches its path exactly, or the router would mark it current on every facet page too.
 */
export function FacetTopicLinks({
  current,
  others,
}: {
  current: string
  others: Array<{ slug: string }>
}) {
  const listed = new Set([current, ...others.map((facet) => facet.slug)])
  return (
    <nav aria-label="Topics">
      <Row gap={2} wrap>
        {FACETS.filter((facet) => facet.page && listed.has(facet.slug)).map((facet) => (
          <Link
            key={facet.slug}
            to="/status-lines/$facet"
            params={{ facet: facet.slug }}
            aria-current={facet.slug === current ? 'page' : undefined}
          >
            <Badge variant={facet.slug === current ? 'default' : 'secondary'}>
              {facetTopicName(facet)}
            </Badge>
          </Link>
        ))}
        <Link to={STATUS_LINES_PATH} activeOptions={{ exact: true }}>
          <Badge variant="link">
            All topics <span aria-hidden="true">→</span>
          </Badge>
        </Link>
      </Row>
    </nav>
  )
}

/** Where to go from a topic list: the most-installed of each kind, or the whole gallery. */
export function BrowseOnLinks() {
  return (
    <Row gap={6} wrap>
      <TextLink to="/status-lines/best">
        Best status lines <span aria-hidden="true">→</span>
      </TextLink>
      <TextLink to={MODS_PATH}>
        Best mods <span aria-hidden="true">→</span>
      </TextLink>
      <TextLink to="/">
        Browse the gallery <span aria-hidden="true">→</span>
      </TextLink>
    </Row>
  )
}
