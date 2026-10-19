import { getHeroLinesFn } from '@/gallery/functions'
import type { HeroLine } from '@/gallery/hero-lines'

let inBrowser: Promise<HeroLine[]> | undefined

/**
 * The hero's status lines for the home loader. The server loads them for every page it renders;
 * the browser keeps its first answer, since the loader runs again on every sort, kind, tag or page
 * change and the hero shows the same lines whatever the gallery shows.
 */
export function loadHeroLines(): Promise<HeroLine[]> {
  if (typeof window === 'undefined') return getHeroLinesFn()
  inBrowser ??= getHeroLinesFn().catch((error: unknown) => {
    inBrowser = undefined
    throw error
  })
  return inBrowser
}
