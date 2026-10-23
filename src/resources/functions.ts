import { createServerFn } from '@tanstack/react-start'
import { resourcesShowcase } from '@/compare/pages'
import { db } from '@/db'
import { getCardsByCopies } from '@/gallery/queries'
import { withHttpStatus } from '@/lib/http.server'

export const getResourcesShowcaseFn = createServerFn({ method: 'GET' }).handler(() =>
  withHttpStatus(async () => resourcesShowcase(await getCardsByCopies(db))),
)
