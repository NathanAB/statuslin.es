import { createServerFn } from '@tanstack/react-start'
import { db } from '@/db'
import { withHttpStatus } from '@/lib/http.server'
import { getHomeShowcase } from './showcase'

/** The home hero's list (see getHomeShowcase). */
export const getHomeShowcaseFn = createServerFn({ method: 'GET' }).handler(() =>
  withHttpStatus(() => getHomeShowcase(db)),
)
