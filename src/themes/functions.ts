import { createServerFn } from '@tanstack/react-start'
import { db } from '@/db'
import { withHttpStatus } from '@/lib/http.server'
import { getHomeThemes, getThemeCards } from './queries'

/** How many theme cards the home page's themes row shows. */
const HOME_THEME_CARDS = 3

export const getThemeCardsFn = createServerFn({ method: 'GET' }).handler(() =>
  withHttpStatus(() => getThemeCards(db)),
)

/** The home page's themes row (see getHomeThemes). */
export const getHomeThemesFn = createServerFn({ method: 'GET' }).handler(() =>
  withHttpStatus(() => getHomeThemes(db, HOME_THEME_CARDS)),
)
