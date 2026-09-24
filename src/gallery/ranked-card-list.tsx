import { GalleryConfigCard } from '@/gallery/config-card'
import type { RankedCard } from '@/gallery/why-line'
import { Stack } from '@/ui/layout'
import { Text } from '@/ui/text'

/** Gallery cards in a fixed order, each followed by its one-line why. `ranked` numbers them. */
export function RankedCardList({
  items,
  surface,
  ranked = false,
}: {
  items: RankedCard[]
  surface: 'best' | 'compare'
  ranked?: boolean
}) {
  return (
    <Stack gap={6}>
      {items.map(({ card, why }, index) => (
        <Stack gap={2} key={card.slug}>
          <GalleryConfigCard card={card} analytics={{ surface, position: index + 1 }} />
          <Text size="sm" muted>
            {ranked ? `#${index + 1}. ${why}` : why}
          </Text>
        </Stack>
      ))}
    </Stack>
  )
}
