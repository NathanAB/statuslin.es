import { createServerFn } from '@tanstack/react-start'
import { db } from '@/db'
import { withHttpStatus } from '@/lib/http.server'
import { getPublishedModThemes, getThemeCards } from './queries'

export const getThemeCardsFn = createServerFn({ method: 'GET' }).handler(() =>
  withHttpStatus(() => getThemeCards(db)),
)

/** The themes a published plugin's page lists. */
export const getPublishedModThemesFn = createServerFn({ method: 'GET' })
  .validator((d: { slug: string }) => d)
  .handler(({ data }) => withHttpStatus(() => getPublishedModThemes(db, data.slug)))
