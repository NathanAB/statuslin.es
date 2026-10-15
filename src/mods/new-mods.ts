import type { GalleryItem, GalleryModCard } from '@/gallery/gallery-items'
import { PAGE_SIZE } from '@/gallery/queries'

/** How many mods the home page's "New mods" row shows. */
export const NEW_MODS_ROW_SIZE = 2

/** Enough newest mods to fill the row even when a whole grid page is mods. */
export const NEW_MOD_CANDIDATES = NEW_MODS_ROW_SIZE + PAGE_SIZE

/** The newest mods the grid isn't already showing, so no mod appears twice on the page. */
export function selectNewMods(
  newestFirst: GalleryModCard[],
  gridItems: GalleryItem[],
): GalleryModCard[] {
  const inGrid = new Set(gridItems.flatMap((item) => (item.kind === 'mod' ? [item.card.slug] : [])))
  return newestFirst.filter((card) => !inGrid.has(card.slug)).slice(0, NEW_MODS_ROW_SIZE)
}
