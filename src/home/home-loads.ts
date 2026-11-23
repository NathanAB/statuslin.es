import { getHomeShowcaseFn } from '@/home/functions'
import { getHomeThemesFn } from '@/themes/functions'

// The loader runs again on every sort, kind or tag change, and these loads don't depend on them.
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

export const loadHomeThemes = onceInBrowser(() => getHomeThemesFn())
