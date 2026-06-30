import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { db } from '@/db'
import { auth } from '@/lib/auth'
import { HttpError } from '@/lib/http'
import { withHttpStatus } from '@/lib/http.server'
import { captureServerEvent } from '@/lib/posthog-server'
import { toggleVote } from './vote'
import { voteEvent } from './vote-event'

export const toggleVoteFn = createServerFn({ method: 'POST' })
  .inputValidator((d: { configId: string }) => d)
  .handler(({ data }) =>
    withHttpStatus(async () => {
      const session = await auth.api.getSession({ headers: getRequestHeaders() })
      if (!session?.user) throw new HttpError(401, 'must be signed in to vote')
      const result = await toggleVote(db, session.user.id, data.configId)
      // Fire the vote event SERVER-SIDE (was browser-side, where ad blockers strip it) so the
      // count is reliable. captureServerEvent is fail-soft, so a telemetry hiccup never 500s a
      // vote that already succeeded.
      const vote = voteEvent({
        userId: session.user.id,
        configId: data.configId,
        voted: result.voted,
        count: result.count,
      })
      captureServerEvent(vote.event, vote.distinctId, vote.properties)
      return result
    }),
  )
