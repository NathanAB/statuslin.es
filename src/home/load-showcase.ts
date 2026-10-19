import { getHomeShowcaseFn } from '@/home/functions'
import type { HomeShowcase } from '@/home/showcase'

let inBrowser: Promise<HomeShowcase> | undefined

/**
 * The home page's showcase for its loader. The server loads it for every page it renders; the
 * browser keeps its first answer, since the loader runs again on every sort, kind, tag or page
 * change and the showcase is the same whatever the gallery shows.
 */
export function loadShowcase(): Promise<HomeShowcase> {
  if (typeof window === 'undefined') return getHomeShowcaseFn()
  inBrowser ??= getHomeShowcaseFn().catch((error: unknown) => {
    inBrowser = undefined
    throw error
  })
  return inBrowser
}
