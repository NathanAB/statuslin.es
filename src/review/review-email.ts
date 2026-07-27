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
  if (error || !data) {
    const name = error?.name ?? 'unknown_error'
    const status = error?.statusCode ?? 'unknown'
    throw new Error(`Resend ${name} (${status})`)
  }
  return { id: data.id }
}
