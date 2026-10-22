import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

export interface IconListItem {
  icon: LucideIcon
  /** A few words on a tile; a sentence, which may hold a link, on a row. */
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
} as const

/**
 * A short list read as one, named by `label`, each item an icon and its words. `tiles` puts a few
 * words on each tile of a grid (the mod safety guide's "What a mod can do"); `rows` stacks
 * sentences, the icon beside each.
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
      {items.map(({ icon: Icon, text }, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: a static list, never reordered, whose text can be a node.
        <li key={i} className={style.item}>
          <Icon aria-hidden="true" className={style.icon} />
          <span className="min-w-0">{text}</span>
        </li>
      ))}
    </ul>
  )
}
