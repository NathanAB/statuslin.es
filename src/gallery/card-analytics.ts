import type { GalleryFilter } from '@/gallery/gallery-items'
import type { GallerySort } from '@/gallery/queries'

/** Where a gallery card was clicked, and the gallery state it was clicked in. */
export interface GalleryCardAnalytics {
  surface: 'home' | 'facet' | 'best' | 'compare' | 'mods' | 'related'
  position: number
  facet?: string
  sort?: GallerySort
  page?: number
  selectedTags?: string[]
  kind?: GalleryFilter
}

/**
 * The properties of a card click event (statusline_card_clicked, mod_card_clicked): the card's
 * ids, then its surface and position, then only the gallery state that surface has.
 */
export function cardClickProperties(
  ids: Record<string, string>,
  { surface, position, ...state }: GalleryCardAnalytics,
): Record<string, unknown> {
  const present = Object.entries(state).filter(([, value]) => value !== undefined)
  return { ...ids, surface, position, ...Object.fromEntries(present) }
}
