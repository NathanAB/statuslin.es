import { ConfigBadges } from '@/gallery/config-badges'
import type { GalleryModCard } from '@/gallery/gallery-items'
import { MOD_ROUTE } from '@/lib/site'
import { AuthorChip } from '@/ui/author-chip'
import { Badge } from '@/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/card'
import { CopyCount } from '@/ui/copy-count'
import { Row, Stack } from '@/ui/layout'
import { StretchedLink } from '@/ui/stretched-link'
import { Text } from '@/ui/text'
import { ModPreview } from './mod-preview'

export function ModCard({ card }: { card: GalleryModCard }) {
  return (
    <Card interactive>
      <CardHeader>
        <Row gap={2} align="start" justify="between">
          <Row gap={2} wrap>
            <CardTitle>
              <StretchedLink to={MOD_ROUTE} params={{ slug: card.slug }}>
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
          <ModPreview mod={card} />
          <Row gap={3} justify="between">
            <Text muted size="sm" breakLong>
              {card.description}
            </Text>
            <Row gap={1}>
              <AuthorChip
                author={{ name: card.authorGithub, username: card.authorGithub, image: null }}
              />
            </Row>
          </Row>
        </Stack>
      </CardContent>
    </Card>
  )
}
