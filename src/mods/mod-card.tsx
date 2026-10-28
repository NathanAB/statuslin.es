import { usePostHog } from '@posthog/react'
import { cardClickProperties, type GalleryCardAnalytics } from '@/gallery/card-analytics'
import { CardMeta } from '@/gallery/card-meta'
import type { GalleryModCard } from '@/gallery/gallery-items'
import { MOD_ROUTE } from '@/lib/site'
import { modAuthor } from '@/mods/mod-author'
import { AuthorChip } from '@/ui/author-chip'
import { GalleryRow } from '@/ui/gallery-row'
import { ModRowPreview } from './mod-preview'

/**
 * One mod in the gallery, as a full-width row like a status line's: its name and author, tags and
 * copies, then how it looks in Claude Desktop or the terminal (`ModRowPreview` picks which).
 */
export function ModCard({
  card,
  analytics,
}: {
  card: GalleryModCard
  analytics?: GalleryCardAnalytics
}) {
  const posthog = usePostHog()

  return (
    <GalleryRow
      to={MOD_ROUTE}
      params={{ slug: card.slug }}
      onOpen={() => {
        if (!analytics) return
        posthog.capture(
          'mod_card_clicked',
          cardClickProperties({ modId: card.modId, slug: card.slug }, analytics),
        )
      }}
      title={card.title}
      byline={<AuthorChip author={modAuthor(card.authorGithub)} />}
      facts={<CardMeta kind="Mod" tags={card.tags} copyCount={card.copyCount} />}
      description={card.description}
    >
      <ModRowPreview card={card} />
    </GalleryRow>
  )
}
