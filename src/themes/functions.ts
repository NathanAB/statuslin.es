import { createServerFn } from '@tanstack/react-start'
import { db } from '@/db'
import { withHttpStatus } from '@/lib/http.server'
import { captureServerException } from '@/lib/posthog-server'
import { getHomeThemes, getPaletteThemes, getThemeCards, homeThemesOrEmpty } from './queries'

const HOME_THEME_CARDS = 3

export const getThemeCardsFn = createServerFn({ method: 'GET' }).handler(() =>
  withHttpStatus(() => getThemeCards(db)),
)

/** The home page's themes row (see getHomeThemes), or none when it fails to load. */
export const getHomeThemesFn = createServerFn({ method: 'GET' }).handler(() =>
  withHttpStatus(() =>
    homeThemesOrEmpty(() => getHomeThemes(db, HOME_THEME_CARDS), captureServerException),
  ),
)

/** A palette page's themes and the palettes beside it (see getPaletteThemes), or null. */
export const getPaletteThemesFn = createServerFn({ method: 'GET' })
  .validator((slug: unknown) => (typeof slug === 'string' ? slug : ''))
  .handler(({ data }) => withHttpStatus(() => getPaletteThemes(db, data)))
