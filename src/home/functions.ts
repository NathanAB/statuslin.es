import { createServerFn } from '@tanstack/react-start'
import { db } from '@/db'
import { withHttpStatus } from '@/lib/http.server'
import { captureServerException } from '@/lib/posthog-server'
import { getHomeShowcase, showcaseOrEmpty } from './showcase'

/** The home hero's list (see getHomeShowcase), or none when it fails to load. */
export const getHomeShowcaseFn = createServerFn({ method: 'GET' }).handler(() =>
  withHttpStatus(() => showcaseOrEmpty(() => getHomeShowcase(db), captureServerException)),
)
