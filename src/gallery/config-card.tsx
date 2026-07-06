import { AuthorChip } from '@/ui/author-chip'
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/card'
import { ConfigBadges } from '@/ui/config-badges'
import { Row, Stack } from '@/ui/layout'
import { StatuslinePreview } from '@/ui/statusline-preview'
import { StretchedLink } from '@/ui/stretched-link'
import { Text } from '@/ui/text'
import type { GalleryCard } from './queries'

/** One gallery card: title, badges, preview, description, author. Used by the home gallery and facet pages. */
export function GalleryConfigCard({ card }: { card: GalleryCard }) {
  return (
    <Card interactive>
      <CardHeader>
        <Row gap={2} align="start" justify="between">
          <Row gap={2}>
            <CardTitle>
              <StretchedLink to="/c/$slug" params={{ slug: card.slug }}>
                {card.title}
              </StretchedLink>
            </CardTitle>
            <Text muted size="sm">
              ⇧ {card.upvoteCount}
            </Text>
          </Row>
          <ConfigBadges
            interpreter={card.interpreter}
            networkHosts={card.networkHosts}
            readsClaudeToken={card.readsClaudeToken}
          />
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
