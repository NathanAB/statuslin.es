import { usePostHog } from '@posthog/react'
import { cardClickProperties, type GalleryCardAnalytics } from '@/gallery/card-analytics'
import { CardMeta } from '@/gallery/card-meta'
import type { GalleryCard } from '@/gallery/queries'
import { AuthorChip } from '@/ui/author-chip'
import { GalleryRow } from '@/ui/gallery-row'
import { StatuslinePreview } from '@/ui/statusline-preview'
import { Text } from '@/ui/text'

/**
 * One status line in the gallery, as a full-width row: its name and author, what it can reach, its
 * tags and copies, then the status line itself and its description. Used by the home gallery,
 * the facet and best pages, and the related lists.
 */
export function GalleryConfigCard({
  card,
  analytics,
}: {
  card: GalleryCard
  analytics?: GalleryCardAnalytics
}) {
  const posthog = usePostHog()

  return (
    <GalleryRow
      to="/c/$slug"
      params={{ slug: card.slug }}
      onOpen={() => {
        if (!analytics) return
        posthog.capture(
          'statusline_card_clicked',
          cardClickProperties({ configId: card.configId, slug: card.slug }, analytics),
        )
      }}
      title={card.title}
      byline={<AuthorChip author={card.author} avatar={false} />}
      facts={
        <CardMeta tags={card.tags} networkHosts={card.networkHosts} copyCount={card.copyCount} />
      }
      description={card.description}
    >
      {card.preview !== null ? (
        <StatuslinePreview segments={card.preview} look="bare" />
      ) : (
        <Text muted size="sm">
          No preview.
        </Text>
      )}
    </GalleryRow>
  )
}
