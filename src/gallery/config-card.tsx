import { usePostHog } from '@posthog/react'
import { ConfigBadges } from '@/gallery/config-badges'
import type { GalleryCard, GallerySort } from '@/gallery/queries'
import { AuthorChip } from '@/ui/author-chip'
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/card'
import { Row, Stack } from '@/ui/layout'
import { StatuslinePreview } from '@/ui/statusline-preview'
import { StretchedLink } from '@/ui/stretched-link'
import { Text } from '@/ui/text'

export interface GalleryCardAnalytics {
  surface: 'home' | 'facet'
  position: number
  facet?: string
  sort?: GallerySort
  page?: number
  selectedTags?: string[]
}

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
          <Row gap={2}>
            <CardTitle>
              <StretchedLink
                to="/c/$slug"
                params={{ slug: card.slug }}
                onClick={() => {
                  if (!analytics) return
                  posthog.capture('statusline_card_clicked', {
                    configId: card.configId,
                    slug: card.slug,
                    surface: analytics.surface,
                    position: analytics.position,
                    ...(analytics.facet ? { facet: analytics.facet } : {}),
                    ...(analytics.sort ? { sort: analytics.sort } : {}),
                    ...(analytics.page ? { page: analytics.page } : {}),
                    ...(analytics.selectedTags ? { selectedTags: analytics.selectedTags } : {}),
                  })
                }}
              >
                {card.title}
              </StretchedLink>
            </CardTitle>
            <Text muted size="sm">
              ⇧ {card.upvoteCount}
            </Text>
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
            <Row gap={1}>
              <AuthorChip author={card.author} />
            </Row>
          </Row>
        </Stack>
      </CardContent>
    </Card>
  )
}
