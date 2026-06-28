import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { db } from '@/db'
import { auth } from '@/lib/auth'
import { HttpError } from '@/lib/http'
import { withHttpStatus } from '@/lib/http.server'
import { pingWorkerWake, workerWakeUrl } from '@/lib/wake'
import { type SubmitInput, submitConfig, validateSubmitInput } from '@/submit/submit'

export const submitConfigFn = createServerFn({ method: 'POST' })
  .inputValidator((data: Omit<SubmitInput, 'authorId'>) => validateSubmitInput(data))
  .handler(({ data }) =>
    withHttpStatus(async () => {
      const session = await auth.api.getSession({ headers: getRequestHeaders() })
      if (!session?.user) throw new HttpError(401, 'must be signed in to submit')
      const result = await submitConfig(db, { ...data, authorId: session.user.id })
      // Best-effort: wake the worker so it renders now instead of on the next safety drain.
      // pingWorkerWake never throws; a miss is recovered by the worker's drains.
      void pingWorkerWake(workerWakeUrl(process.env))
      return result
    }),
  )
