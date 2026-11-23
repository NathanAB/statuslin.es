import { createServerFn } from '@tanstack/react-start'
import { db } from '@/db'
import { withHttpStatus } from '@/lib/http.server'
import { getThemeCards } from './queries'

export const getThemeCardsFn = createServerFn({ method: 'GET' }).handler(() =>
  withHttpStatus(() => getThemeCards(db)),
)
