import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { db } from '@/db'
import { auth } from '@/lib/auth'
import { HttpError } from '@/lib/http'
import { withHttpStatus } from '@/lib/http.server'
import { toggleVote } from './vote'

export const toggleVoteFn = createServerFn({ method: 'POST' })
  .inputValidator((d: { configId: string }) => d)
  .handler(({ data }) =>
    withHttpStatus(async () => {
      const session = await auth.api.getSession({ headers: getRequestHeaders() })
      if (!session?.user) throw new HttpError(401, 'must be signed in to vote')
      return toggleVote(db, session.user.id, data.configId)
    }),
  )
