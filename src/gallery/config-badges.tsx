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
import { FACET_BY_SLUG, tagHref } from '@/gallery/facets'
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

/** The chips on a gallery card + the detail page: one per tag in the config's allTags,
 *  each linking to its facet page (or the tag-filtered home for tags with no page).
 *  `network-access` additionally carries a tooltip listing the hosts the config declares.
 *  `aboveOverlay` lifts the whole row above the card's stretched-link overlay so every
 *  badge link stays clickable. Rendered once here so the card and detail page match. */
export function ConfigBadges({ tags, networkHosts }: { tags: string[]; networkHosts: string[] }) {
  return (
    <Row gap={2} wrap aboveOverlay>
      {tags.map((slug) => {
        const Icon = iconFor(slug)
        const label = FACET_BY_SLUG.get(slug)?.chipLabel ?? slug
        const isNetworkWithHosts = slug === 'network-access' && networkHosts.length > 0
        const linked = (
          <Link
            {...tagHref(slug)}
            {...(isNetworkWithHosts
              ? { 'aria-label': `Uses network: ${networkHosts.join(', ')}` }
              : {})}
          >
            <Badge variant="secondary">
              <Icon />
              {label}
            </Badge>
          </Link>
        )
        if (isNetworkWithHosts) {
          return (
            <Tooltip
              key={slug}
              content={
                <Stack gap={1}>
                  <Text size="xs">Communicates with these domains over the network:</Text>
                  {networkHosts.map((host) => (
                    <Text key={host} size="xs" muted>
                      {host}
                    </Text>
                  ))}
                </Stack>
              }
            >
              {linked}
            </Tooltip>
          )
        }
        return <span key={slug}>{linked}</span>
      })}
    </Row>
  )
}
