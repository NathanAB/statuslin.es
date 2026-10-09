import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { and, eq } from 'drizzle-orm'
import { db } from '@/db'
import { configs } from '@/db/schema'
import { auth } from '@/lib/auth'
import { withHttpStatus } from '@/lib/http.server'

/**
 * Whether the signed-in viewer wrote the published config at `slug`. The config page uses it to
 * offer its author the update form; the author's user id never leaves the server.
 */
export const getViewerIsAuthor = createServerFn({ method: 'GET' })
  .inputValidator((d: { slug: string }) => d)
  .handler(({ data }) =>
    withHttpStatus(async () => {
      const session = await auth.api.getSession({ headers: getRequestHeaders() })
      if (!session?.user) return false
      const [owned] = await db
        .select({ id: configs.id })
        .from(configs)
        .where(
          and(
            eq(configs.slug, data.slug),
            eq(configs.authorId, session.user.id),
            eq(configs.status, 'published'),
          ),
        )
      return owned !== undefined
    }),
  )
