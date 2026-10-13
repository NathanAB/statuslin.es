import { GalleryConfigCard } from '@/gallery/config-card'
import type { GalleryItem } from '@/gallery/gallery-items'
import { Stack } from '@/ui/layout'
import { SectionCard } from '@/ui/section-card'
import { ModCard } from './mod-card'

/** The foot of a mod page: the mods, then status lines, that share its tags. Nothing without any. */
export function ModRelated({ items }: { items: GalleryItem[] }) {
  if (items.length === 0) return null
  return (
    <SectionCard title="More like this" headingLevel={2}>
      <Stack gap={3}>
        {items.map((item) =>
          item.kind === 'mod' ? (
            <ModCard key={`mod:${item.card.slug}`} card={item.card} />
          ) : (
            <GalleryConfigCard key={`status-line:${item.card.slug}`} card={item.card} />
          ),
        )}
      </Stack>
    </SectionCard>
  )
}
