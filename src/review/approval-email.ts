import { CONTACT_EMAIL, siteUrl } from '@/lib/site'
import {
  REVIEW_EMAIL_FROM,
  type ReviewEmailSend,
  type ReviewedChange,
  sendReviewEmail,
} from './review-email'

export interface ApprovalEmailInput {
  versionId: string
  authorName: string
  authorEmail: string
  /** The newly live version's title. */
  title: string
  /** What was reviewed, as the email names it: 'status line' or 'mod'. */
  noun: string
  /** The page the version is live on. */
  pagePath: string
  kind: ReviewedChange
}

export type SendApprovalEmail = (input: ApprovalEmailInput) => Promise<{ id: string }>

const APPROVAL_WORDING: Record<
  ReviewedChange,
  { subject: string; headline: (noun: string, title: string) => string }
> = {
  submission: {
    subject: 'Your statuslin.es submission was approved',
    headline: (noun, title) => `Your ${noun} submission “${title}” was approved.`,
  },
  update: {
    subject: 'Your statuslin.es update is live',
    headline: (_noun, title) => `Your update to “${title}” is live.`,
  },
}

function approvalEmailText(input: ApprovalEmailInput): string {
  const origin = siteUrl()
  return [
    `Hi ${input.authorName},`,
    '',
    APPROVAL_WORDING[input.kind].headline(input.noun, input.title),
    '',
    `View it on statuslin.es: ${origin}${input.pagePath}`,
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
      subject: APPROVAL_WORDING[input.kind].subject,
      text: approvalEmailText(input),
    },
    `approval/${input.versionId}`,
    send,
  )
}
