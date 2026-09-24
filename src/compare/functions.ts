import { createServerFn } from '@tanstack/react-start'
import { buildComparePage } from '@/compare/pages'
import { db } from '@/db'
import { getCardsByCopies } from '@/gallery/queries'
import { withHttpStatus } from '@/lib/http.server'

export const getComparePage = createServerFn({ method: 'GET' })
  .inputValidator((d: { path: string }) => d)
  .handler(({ data }) =>
    withHttpStatus(async () => buildComparePage(data.path, await getCardsByCopies(db))),
  )
