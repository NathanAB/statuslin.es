import type { GalleryFilter } from '@/gallery/gallery-items'
import type { GallerySort } from '@/gallery/queries'

/** Where a gallery card was clicked, and the gallery state it was clicked in. */
export interface GalleryCardAnalytics {
  /**
   * `related` is a status line page's suggestions; `mod_related` is a mod page's "More like this";
   * `home_featured_mod` is the featured mod, first in the home page's mods row, and
   * `home_mods_row` the other mods in that row; `buddy_guide` is the pet mods on
   * /guide/claude-code-buddy.
   */
  surface:
    | 'home'
    | 'home_featured_mod'
    | 'home_mods_row'
    | 'facet'
    | 'best'
    | 'compare'
    | 'resources'
    | 'mods'
    | 'related'
    | 'mod_related'
    | 'buddy_guide'
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
