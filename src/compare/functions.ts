import { createServerFn } from '@tanstack/react-start'
import { buildComparePage } from '@/compare/pages'
import { db } from '@/db'
import { getCardsByCopies } from '@/gallery/queries'
import { withHttpStatus } from '@/lib/http.server'

/** A comparison page by its path, or null (404) when unknown or too thin to ship. */
export const getComparePage = createServerFn({ method: 'GET' })
  .inputValidator((d: { path: string }) => d)
  .handler(({ data }) =>
    withHttpStatus(async () => buildComparePage(data.path, await getCardsByCopies(db))),
  )
