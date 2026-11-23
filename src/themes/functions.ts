import { createServerFn } from '@tanstack/react-start'
import { db } from '@/db'
import { withHttpStatus } from '@/lib/http.server'
import { captureServerException } from '@/lib/posthog-server'
import { getHomeThemes, getThemeCards, homeThemesOrEmpty } from './queries'

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
