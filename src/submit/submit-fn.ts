import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { db } from '@/db'
import { auth } from '@/lib/auth'
import { HttpError } from '@/lib/http'
import { withHttpStatus } from '@/lib/http.server'
import { captureServerEvent } from '@/lib/posthog-server'
import { isUuid } from '@/lib/uuid'
import { pingWorkerWake, workerWakeUrl } from '@/lib/wake'
import {
  getResubmissionDraft,
  type SubmitInput,
  submitConfig,
  validateSubmitInput,
} from '@/submit/submit'
import { submittedEvent } from '@/submit/submitted-event'

type SubmitRequest = Omit<SubmitInput, 'authorId'> & { rejectedVersionId?: string }
const SUBMISSION_SLUG_MAX = 256

function validateResubmissionRequest(data: { slug: unknown }) {
  if (typeof data.slug !== 'string') throw new HttpError(400, 'invalid submission')
  const slug = data.slug.trim()
  if (!slug || slug.length > SUBMISSION_SLUG_MAX || !/^[a-z0-9-]+$/.test(slug)) {
    throw new HttpError(400, 'invalid submission')
  }
  return { slug }
}

function validateSubmitRequest(data: SubmitRequest): SubmitRequest {
  const input = validateSubmitInput(data)
  if (data.rejectedVersionId === undefined) return input
  if (typeof data.rejectedVersionId !== 'string') {
    throw new HttpError(400, 'invalid rejected version')
  }
  const rejectedVersionId = data.rejectedVersionId.trim()
  if (!isUuid(rejectedVersionId)) throw new HttpError(400, 'invalid rejected version')
  return {
    ...input,
    rejectedVersionId,
  }
}

export const submitConfigFn = createServerFn({ method: 'POST' })
  .inputValidator(validateSubmitRequest)
  .handler(({ data }) =>
    withHttpStatus(async () => {
      const session = await auth.api.getSession({ headers: getRequestHeaders() })
      if (!session?.user) throw new HttpError(401, 'must be signed in to submit')
      const { rejectedVersionId, ...input } = data
      const result = await submitConfig(
        db,
        { ...input, authorId: session.user.id },
        rejectedVersionId === undefined ? {} : { rejectedVersionId },
      )
      // Fire the submission event SERVER-SIDE (was browser-side, where ad blockers strip it) so the
      // count is reliable — this is also what an email-on-submit alert filters on. captureServerEvent
      // is fail-soft, so a telemetry hiccup never 500s a submission that already succeeded.
      const submitted = submittedEvent({
        userId: session.user.id,
        interpreter: data.interpreter,
        slug: result.slug,
      })
      captureServerEvent(submitted.event, submitted.distinctId, submitted.properties)
      // Best-effort: wake the worker so it renders now instead of on the next safety drain.
      // pingWorkerWake never throws; a miss is recovered by the worker's drains.
      void pingWorkerWake(workerWakeUrl(process.env))
      return result
    }),
  )

export const getResubmissionDraftFn = createServerFn({ method: 'GET' })
  .inputValidator(validateResubmissionRequest)
  .handler(({ data }) =>
    withHttpStatus(async () => {
      const session = await auth.api.getSession({ headers: getRequestHeaders() })
      if (!session?.user) throw new HttpError(401, 'must be signed in to resubmit')
      return getResubmissionDraft(db, data.slug, session.user.id)
    }),
  )
