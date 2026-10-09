import { CONTACT_EMAIL, siteUrl } from '@/lib/site'
import {
  REVIEW_EMAIL_FROM,
  type ReviewEmailSend,
  type ReviewedChange,
  sendReviewEmail,
} from './review-email'

export interface RejectionEmailInput {
  versionId: string
  authorName: string
  authorEmail: string
  /** The rejected version's title for a submission; the live version's title for an update. */
  title: string
  reason: string
  slug: string
  kind: ReviewedChange
}

export type SendRejectionEmail = (input: RejectionEmailInput) => Promise<{ id: string }>

const REJECTION_WORDING: Record<
  ReviewedChange,
  {
    subject: string
    headline: (title: string) => string
    /** Lines between the reason and the links, if any. */
    note: string[]
    nextStep: (origin: string, slug: string) => string
  }
> = {
  submission: {
    subject: 'Your statuslin.es submission was not accepted',
    headline: (title) => `Your status line submission “${title}” was not accepted.`,
    note: [],
    nextStep: (origin, slug) => `Fix and resubmit: ${origin}/submit?resubmit=${slug}`,
  },
  update: {
    subject: 'Your statuslin.es update was not accepted',
    headline: (title) => `Your update to “${title}” was not accepted.`,
    note: ['Your live version is unaffected and stays in the gallery.', ''],
    nextStep: (origin, slug) => `Submit a new update: ${origin}/submit?update=${slug}`,
  },
}

function rejectionEmailText(input: RejectionEmailInput): string {
  const origin = siteUrl()
  const wording = REJECTION_WORDING[input.kind]
  return [
    `Hi ${input.authorName},`,
    '',
    wording.headline(input.title),
    '',
    'Reviewer reason:',
    input.reason,
    '',
    ...wording.note,
    `View your submissions: ${origin}/me`,
    wording.nextStep(origin, encodeURIComponent(input.slug)),
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
      subject: REJECTION_WORDING[input.kind].subject,
      text: rejectionEmailText(input),
    },
    `rejection/${input.versionId}`,
    send,
  )
}
