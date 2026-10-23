import { GalleryConfigCard } from '@/gallery/config-card'
import type { GalleryItem } from '@/gallery/gallery-items'
import { GalleryList } from '@/ui/gallery-row'
import { PageSection } from '@/ui/page-section'
import { ModCard } from './mod-card'

/** The foot of a mod page: the mods, then status lines, that share its tags. Nothing without any. */
export function ModRelated({ items }: { items: GalleryItem[] }) {
  if (items.length === 0) return null
  return (
    <PageSection title="More like this">
      <GalleryList>
        {items.map((item, index) =>
          item.kind === 'mod' ? (
            <ModCard
              key={`mod:${item.card.slug}`}
              card={item.card}
              analytics={{ surface: 'mod_related', position: index + 1 }}
            />
          ) : (
            <GalleryConfigCard
              key={`status-line:${item.card.slug}`}
              card={item.card}
              analytics={{ surface: 'mod_related', position: index + 1 }}
            />
          ),
        )}
      </GalleryList>
    </PageSection>
  )
}
