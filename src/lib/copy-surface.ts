/** Where a visitor copied an install prompt: the item's own page, or the home page's hero. */
export type CopySurface = 'page' | 'home_hero'

const SURFACES: ReadonlySet<unknown> = new Set<CopySurface>(['page', 'home_hero'])

/**
 * The copy event's `surface`. The browser sends it, so anything unknown counts as a page copy.
 */
export function copySurface(value: unknown): CopySurface {
  return SURFACES.has(value) ? (value as CopySurface) : 'page'
}
