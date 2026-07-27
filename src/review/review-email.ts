import {
  type CreateEmailOptions,
  type CreateEmailRequestOptions,
  type CreateEmailResponse,
  Resend,
} from 'resend'
import { requireEnv } from '@/lib/env'

export const REVIEW_EMAIL_FROM = 'statuslin.es reviews <reviews@statuslin.es>'

export type ReviewEmailSend = (
  payload: CreateEmailOptions,
  options?: CreateEmailRequestOptions,
) => Promise<CreateEmailResponse>

/** A definitive Resend API rejection. Transport exceptions remain ambiguous because the request
 * may have reached Resend even when the response never reached this process. */
export class ReviewEmailProviderError extends Error {
  override name = 'ReviewEmailProviderError'
}

function sendWithResend(
  payload: CreateEmailOptions,
  options?: CreateEmailRequestOptions,
): Promise<CreateEmailResponse> {
  return new Resend(requireEnv('RESEND_API_KEY')).emails.send(payload, options)
}

export async function sendReviewEmail(
  payload: CreateEmailOptions,
  idempotencyKey: string,
  send: ReviewEmailSend = sendWithResend,
): Promise<{ id: string }> {
  const { data, error } = await send(payload, { idempotencyKey })
  if (error) {
    throw new ReviewEmailProviderError(`Resend ${error.name} (${error.statusCode ?? 'unknown'})`)
  }
  if (!data) throw new Error('Resend returned no delivery result')
  return { id: data.id }
}
