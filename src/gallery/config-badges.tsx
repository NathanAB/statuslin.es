import { Link } from '@tanstack/react-router'
import {
  Braces,
  Code,
  Globe,
  Hexagon,
  KeyRound,
  type LucideIcon,
  Tag,
  Terminal,
} from 'lucide-react'
import { FACET_BY_SLUG, facetLabel, tagHref } from '@/gallery/facets'
import { Badge } from '@/ui/badge'
import { Row, Stack } from '@/ui/layout'
import { Text } from '@/ui/text'
import { Tooltip } from '@/ui/tooltip'

// One icon per interpreter/capability slug; a feature-group slug with no entry here
// falls back to `Tag`, everything else to `Code`.
const TAG_ICON: Record<string, LucideIcon> = {
  bash: Terminal,
  node: Hexagon,
  python: Braces,
  'network-access': Globe,
  'reads-token': KeyRound,
}

export function iconFor(slug: string): LucideIcon {
  return TAG_ICON[slug] ?? (FACET_BY_SLUG.get(slug)?.group === 'feature' ? Tag : Code)
}

/** A page header's topic tags: what it can reach (network, the Claude login) is a risk to weigh,
 *  said in the install panel beside the button, not a topic chip. */
export function topicTags(tags: string[]): string[] {
  return tags.filter((slug) => FACET_BY_SLUG.get(slug)?.group !== 'capability')
}

/** The tag chips on a detail page: one per tag in the config's allTags,
 *  each linking to its facet page (or the tag-filtered home for tags with no page).
 *  `network-access` additionally carries a tooltip listing the hosts the config declares.
 *  `aboveOverlay` lifts the badge links (and the network tooltip, whose badge takes hover
 *  rather than opening the card) above the card's stretched-link overlay so they stay
 *  clickable; the gaps between them still open the card. Used by the detail pages' headers. */
export function ConfigBadges({ tags, networkHosts }: { tags: string[]; networkHosts: string[] }) {
  return (
    <Row gap={2} wrap aboveOverlay>
      {tags.map((slug) => {
        const Icon = iconFor(slug)
        const label = facetLabel(slug)
        const hasPage = FACET_BY_SLUG.get(slug)?.page ?? false
        const isNetworkWithHosts = slug === 'network-access' && networkHosts.length > 0
        const badge = (
          <Badge variant="secondary">
            <Icon />
            {label}
          </Badge>
        )
        // Feature/interpreter tags link to their facet page. Capability tags (no page) are
        // security/info signals, not browse dimensions, so they render as plain, non-clickable
        // badges — a `?tags=` link for them just re-showed the whole gallery and felt broken.
        const content = hasPage ? <Link {...tagHref(slug)}>{badge}</Link> : badge
        if (isNetworkWithHosts) {
          return (
            <Tooltip
              key={slug}
              content={
                <Stack gap={1}>
                  <Text size="xs">Connects to:</Text>
                  {networkHosts.map((host) => (
                    <Text key={host} size="xs" muted>
                      {host}
                    </Text>
                  ))}
                </Stack>
              }
            >
              <span role="img" aria-label={`Connects to ${networkHosts.join(', ')}`}>
                {content}
              </span>
            </Tooltip>
          )
        }
        return <span key={slug}>{content}</span>
      })}
    </Row>
  )
}
