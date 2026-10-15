import { usePostHog } from '@posthog/react'
import { cardClickProperties, type GalleryCardAnalytics } from '@/gallery/card-analytics'
import { ConfigBadges } from '@/gallery/config-badges'
import type { GalleryCard } from '@/gallery/queries'
import { AuthorChip } from '@/ui/author-chip'
import { Badge } from '@/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/card'
import { CopyCount } from '@/ui/copy-count'
import { Row, Stack } from '@/ui/layout'
import { StatuslinePreview } from '@/ui/statusline-preview'
import { StretchedLink } from '@/ui/stretched-link'
import { Text } from '@/ui/text'

/** One gallery card: title, badges, preview, description, author. Used by the home gallery and facet pages. */
export function GalleryConfigCard({
  card,
  analytics,
}: {
  card: GalleryCard
  analytics?: GalleryCardAnalytics
}) {
  const posthog = usePostHog()

  return (
    <Card interactive>
      <CardHeader>
        <Row gap={2} align="start" justify="between">
          <Row gap={2} wrap>
            <CardTitle>
              <StretchedLink
                to="/c/$slug"
                params={{ slug: card.slug }}
                onClick={() => {
                  if (!analytics) return
                  posthog.capture(
                    'statusline_card_clicked',
                    cardClickProperties({ configId: card.configId, slug: card.slug }, analytics),
                  )
                }}
              >
                {card.title}
              </StretchedLink>
            </CardTitle>
            <Badge variant="outline">Status line</Badge>
            <CopyCount count={card.copyCount} />
          </Row>
          <ConfigBadges tags={card.tags} networkHosts={card.networkHosts} align="end" />
        </Row>
      </CardHeader>
      <CardContent>
        <Stack gap={3}>
          {card.preview !== null ? (
            <StatuslinePreview segments={card.preview} />
          ) : (
            <Text muted size="sm">
              No preview.
            </Text>
          )}
          <Row gap={3} justify="between">
            <Text muted size="sm" breakLong>
              {card.description}
            </Text>
            <Row gap={1} aboveOverlay>
              <AuthorChip author={card.author} />
            </Row>
          </Row>
        </Stack>
      </CardContent>
    </Card>
  )
}
