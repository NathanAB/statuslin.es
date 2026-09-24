import { ConfigBadges } from '@/gallery/config-badges'
import { Row, Stack } from '@/ui/layout'
import { Text } from '@/ui/text'

export interface HomeFacetLink {
  slug: string
  chipLabel: string
}

export function HomeGalleryIntro() {
  return (
    <Stack gap={3}>
      <h1 className="font-medium text-foreground text-lg leading-snug">
        A gallery of Claude Code status lines
      </h1>
      <Text size="sm" measure>
        Community-submitted and reviewed by hand. Every card shows the real script's output.
      </Text>
    </Stack>
  )
}

export function HomeFeatureDirectory({ facets }: { facets: HomeFacetLink[] }) {
  if (facets.length === 0) return null
  return (
    <Row gap={3} align="center" wrap>
      <Text muted size="sm" inline>
        Browse by feature
      </Text>
      <ConfigBadges tags={facets.map((facet) => facet.slug)} networkHosts={[]} />
    </Row>
  )
}

function utcDateLabel(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00.000Z`)
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date)
}

export function HomeIndexNote({
  publishedCount,
  copyCount,
  asOf,
}: {
  publishedCount: number
  copyCount: number
  asOf: string
}) {
  return (
    <Stack gap={1}>
      <Text muted size="xs" center>
        {publishedCount} published status lines, copied {copyCount.toLocaleString('en-US')} times as
        of <time dateTime={asOf}>{utcDateLabel(asOf)}</time>.
      </Text>
      <Text muted size="xs" center>
        A gallery of scripts you paste into Claude Code, not a TUI installer.
      </Text>
    </Stack>
  )
}
