import { CONTACT_EMAIL, siteUrl } from '@/lib/site'
import { REVIEW_EMAIL_FROM, type ReviewEmailSend, sendReviewEmail } from './review-email'

const REJECTION_SUBJECT = 'Your statuslin.es submission was not accepted'

export interface RejectionEmailInput {
  versionId: string
  authorName: string
  authorEmail: string
  title: string
  reason: string
  slug: string
}

export type SendRejectionEmail = (input: RejectionEmailInput) => Promise<{ id: string }>

function rejectionEmailText(input: RejectionEmailInput): string {
  const origin = siteUrl()
  return [
    `Hi ${input.authorName},`,
    '',
    `Your status line submission “${input.title}” was not accepted.`,
    '',
    'Reviewer reason:',
    input.reason,
    '',
    `View your submissions: ${origin}/me`,
    `Fix and resubmit: ${origin}/submit?resubmit=${encodeURIComponent(input.slug)}`,
    '',
    `Questions? Reply to this email or contact ${CONTACT_EMAIL}.`,
  ].join('\n')
}

export async function sendRejectionEmail(
  input: RejectionEmailInput,
  send?: ReviewEmailSend,
): Promise<{ id: string }> {
  return sendReviewEmail(
    {
      from: REVIEW_EMAIL_FROM,
      to: input.authorEmail,
      replyTo: CONTACT_EMAIL,
      subject: REJECTION_SUBJECT,
      text: rejectionEmailText(input),
    },
    `rejection/${input.versionId}`,
    send,
  )
}
