import { getHomeShowcaseFn } from '@/home/functions'
import { getHomeThemesFn } from '@/themes/functions'

/**
 * A home page load that is the same whatever the gallery shows. The server loads it for every page
 * it renders; the browser keeps its first answer, since the loader runs again on every sort, kind,
 * tag or page change. A failure is not kept, so the next run asks again.
 */
function onceInBrowser<T>(load: () => Promise<T>): () => Promise<T> {
  let inBrowser: Promise<T> | undefined
  return () => {
    if (typeof window === 'undefined') return load()
    inBrowser ??= load().catch((error: unknown) => {
      inBrowser = undefined
      throw error
    })
    return inBrowser
  }
}

/** The hero's list (see getHomeShowcase). */
export const loadShowcase = onceInBrowser(() => getHomeShowcaseFn())

/** The themes row's cards and how many themes /themes lists. */
export const loadHomeThemes = onceInBrowser(() => getHomeThemesFn())
