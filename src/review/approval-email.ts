import { CONTACT_EMAIL, siteUrl } from '@/lib/site'
import { REVIEW_EMAIL_FROM, type ReviewEmailSend, sendReviewEmail } from './review-email'

const APPROVAL_SUBJECT = 'Your statuslin.es submission was approved'

export interface ApprovalEmailInput {
  versionId: string
  authorName: string
  authorEmail: string
  title: string
  slug: string
}

export type SendApprovalEmail = (input: ApprovalEmailInput) => Promise<{ id: string }>

function approvalEmailText(input: ApprovalEmailInput): string {
  const origin = siteUrl()
  return [
    `Hi ${input.authorName},`,
    '',
    `Your status line submission “${input.title}” was approved.`,
    '',
    `View it on statuslin.es: ${origin}/c/${encodeURIComponent(input.slug)}`,
    `View your submissions: ${origin}/me`,
    '',
    `Questions? Reply to this email or contact ${CONTACT_EMAIL}.`,
  ].join('\n')
}

export function sendApprovalEmail(
  input: ApprovalEmailInput,
  send?: ReviewEmailSend,
): Promise<{ id: string }> {
  return sendReviewEmail(
    {
      from: REVIEW_EMAIL_FROM,
      to: input.authorEmail,
      replyTo: CONTACT_EMAIL,
      subject: APPROVAL_SUBJECT,
      text: approvalEmailText(input),
    },
    `approval/${input.versionId}`,
    send,
  )
}
