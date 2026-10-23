import { createServerFn } from '@tanstack/react-start'
import { db } from '@/db'
import { withHttpStatus } from '@/lib/http.server'
import { siteUrl } from '@/lib/site'
import { getHowItWorksExamples } from './examples'

/** The real listings /how-it-works shows its steps with (see getHowItWorksExamples). */
export const getHowItWorksExamplesFn = createServerFn({ method: 'GET' }).handler(() =>
  withHttpStatus(() => getHowItWorksExamples(db, siteUrl())),
)
