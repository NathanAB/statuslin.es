import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Heading, Text } from '@/ui/text'

export interface IconListItem {
  icon: LucideIcon
  /** A card's name, over its line. */
  title?: string | undefined
  /** A few words on a tile; a sentence, which may hold a link, on a row; a line on a card. */
  text: ReactNode
}

const LOOK = {
  tiles: {
    list: 'grid grid-cols-2 gap-3 lg:grid-cols-4',
    item: 'flex flex-col gap-3 rounded-tile bg-card px-4 py-4 text-foreground',
    icon: 'size-5 text-primary',
  },
  rows: {
    list: 'flex flex-col gap-3',
    item: 'flex gap-3 text-foreground',
    icon: 'mt-1 size-4 shrink-0 text-primary',
  },
  // Below 640px a card is one row, its icon beside its words, so four of them stay short.
  cards: {
    list: 'grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4',
    item: 'flex gap-3 rounded-tile bg-card px-4 py-4 text-foreground sm:flex-col sm:gap-4 sm:px-5 sm:py-5',
    icon: 'mt-0.5 size-5 shrink-0 text-primary sm:mt-0',
  },
} as const

/**
 * A short list read as one, named by `label`, each item an icon and its words. `tiles` puts a few
 * words on each tile of a grid (the mod safety guide's "What a mod can do"); `rows` stacks
 * sentences, the icon beside each; `cards` names each card with its `title` over a line of muted
 * text, one up on a phone, two from 640px and four from 1024px (the home page's four checks).
 */
export function IconList({
  label,
  items,
  look,
}: {
  label: string
  items: IconListItem[]
  look: keyof typeof LOOK
}) {
  const style = LOOK[look]
  return (
    <ul aria-label={label} className={style.list}>
      {items.map(({ icon: Icon, title, text }, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: a static list, never reordered, whose text can be a node.
        <li key={i} className={style.item}>
          <Icon aria-hidden="true" className={style.icon} />
          {title === undefined ? (
            <span className="min-w-0">{text}</span>
          ) : (
            <div className="flex min-w-0 flex-col gap-1">
              <Heading level={3}>{title}</Heading>
              <Text muted size="sm">
                {text}
              </Text>
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}
