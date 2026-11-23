/**
 * Where a visitor copied an install prompt or command: the item's own page, the home page's hero,
 * a theme card on /themes, or one in the home page's themes row.
 */
const COPY_SURFACES = ['page', 'home_hero', 'themes', 'home_themes'] as const
export type CopySurface = (typeof COPY_SURFACES)[number]

/**
 * The copy event's `surface`. The browser sends it, so anything unknown counts as a page copy.
 */
export function copySurface(value: unknown): CopySurface {
  return COPY_SURFACES.find((surface) => surface === value) ?? 'page'
}
