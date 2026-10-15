import { usePostHog } from '@posthog/react'
import { cardClickProperties, type GalleryCardAnalytics } from '@/gallery/card-analytics'
import { ConfigBadges } from '@/gallery/config-badges'
import type { GalleryModCard } from '@/gallery/gallery-items'
import { githubAvatarUrl } from '@/lib/github-avatars'
import { MOD_ROUTE } from '@/lib/site'
import { AuthorChip } from '@/ui/author-chip'
import { Badge } from '@/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/card'
import { CopyCount } from '@/ui/copy-count'
import { Row, Stack } from '@/ui/layout'
import { StretchedLink } from '@/ui/stretched-link'
import { Text } from '@/ui/text'
import { ModCardPreview } from './mod-preview'

export function ModCard({
  card,
  analytics,
}: {
  card: GalleryModCard
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
                to={MOD_ROUTE}
                params={{ slug: card.slug }}
                onClick={() => {
                  if (!analytics) return
                  posthog.capture(
                    'mod_card_clicked',
                    cardClickProperties({ modId: card.modId, slug: card.slug }, analytics),
                  )
                }}
              >
                {card.title}
              </StretchedLink>
            </CardTitle>
            <Badge variant="outline">Mod</Badge>
            <CopyCount count={card.copyCount} />
          </Row>
          <ConfigBadges tags={card.tags} networkHosts={[]} align="end" />
        </Row>
      </CardHeader>
      <CardContent>
        <Stack gap={3}>
          <ModCardPreview card={card} />
          <Row gap={3} justify="between">
            <Text muted size="sm" breakLong>
              {card.description}
            </Text>
            <Row gap={1} aboveOverlay>
              <AuthorChip
                author={{
                  name: card.authorGithub,
                  username: card.authorGithub,
                  image: githubAvatarUrl(card.authorGithub),
                }}
              />
            </Row>
          </Row>
        </Stack>
      </CardContent>
    </Card>
  )
}
