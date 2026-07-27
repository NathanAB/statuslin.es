import { and, desc, eq, inArray } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { configs, configVersions, user } from '@/db/schema'
import { HttpError } from '@/lib/http'
import {
  type RejectionEmailInput,
  type SendRejectionEmail,
  sendRejectionEmail,
} from './rejection-email'
import { ReviewEmailProviderError } from './review-email'

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

export const REJECTION_REASON_MAX = 2000
export type RejectionEmailStatus =
  | 'pending'
  | 'sending'
  | 'sent'
  | 'failed'
  | 'unavailable'
  | 'ambiguous'
  | 'superseded'
const UNSENT_REJECTION_EMAIL_STATUSES = ['pending', 'failed', 'unavailable'] as const

export async function rejectVersion(
  database: Db,
  versionId: string,
  reviewerId: string,
  reason: string,
): Promise<void> {
  const trimmedReason = reason.trim()
  if (!trimmedReason || trimmedReason.length > REJECTION_REASON_MAX) {
    throw new HttpError(
      400,
      `rejection reason must be between 1 and ${REJECTION_REASON_MAX} characters`,
    )
  }
  const [row] = await database
    .update(configVersions)
    .set({
      status: 'rejected',
      reviewedBy: reviewerId,
      reviewedAt: new Date(),
      rejectionReason: trimmedReason,
      rejectionEmailStatus: 'pending',
      rejectionEmailId: null,
      rejectionEmailError: null,
      rejectionEmailSentAt: null,
    })
    .where(and(eq(configVersions.id, versionId), eq(configVersions.status, 'pending')))
    .returning()
  if (!row) throw new HttpError(409, 'version not in a reviewable (pending) state')
}

async function isCurrentRejectedDraft(
  database: Db,
  configId: string,
  versionId: string,
  configStatus: string,
  currentVersionId: string | null,
): Promise<boolean> {
  const [latest] = await database
    .select({ id: configVersions.id })
    .from(configVersions)
    .where(eq(configVersions.configId, configId))
    .orderBy(desc(configVersions.versionNumber))
    .limit(1)
  return configStatus === 'draft' && currentVersionId === null && latest?.id === versionId
}

function assertRetryableRejectionEmailStatus(status: string | null): void {
  if (UNSENT_REJECTION_EMAIL_STATUSES.some((candidate) => candidate === status)) return
  if (status === 'sent') throw new HttpError(409, 'rejection email already sent')
  throw new HttpError(409, 'rejection email is not pending delivery')
}

async function deliverRejectionEmail(
  database: Db,
  versionId: string,
  send: SendRejectionEmail,
): Promise<RejectionEmailStatus> {
  const [row] = await database
    .select({
      configId: configs.id,
      configStatus: configs.status,
      currentVersionId: configs.currentVersionId,
      versionStatus: configVersions.status,
      emailStatus: configVersions.rejectionEmailStatus,
      reason: configVersions.rejectionReason,
      authorName: user.name,
      authorEmail: user.email,
      emailVerified: user.emailVerified,
      title: configs.title,
      slug: configs.slug,
    })
    .from(configVersions)
    .innerJoin(configs, eq(configs.id, configVersions.configId))
    .innerJoin(user, eq(user.id, configs.authorId))
    .where(eq(configVersions.id, versionId))
  if (row?.versionStatus !== 'rejected' || !row.reason) {
    throw new HttpError(409, 'version is not an email-ready rejection')
  }
  if (
    !(await isCurrentRejectedDraft(
      database,
      row.configId,
      versionId,
      row.configStatus,
      row.currentVersionId,
    ))
  ) {
    throw new HttpError(409, 'rejection email was superseded by a newer submission state')
  }
  assertRetryableRejectionEmailStatus(row.emailStatus)
  if (!row.emailVerified) {
    const [updated] = await database
      .update(configVersions)
      .set({ rejectionEmailStatus: 'unavailable', rejectionEmailError: null })
      .where(
        and(
          eq(configVersions.id, versionId),
          eq(configVersions.status, 'rejected'),
          inArray(configVersions.rejectionEmailStatus, UNSENT_REJECTION_EMAIL_STATUSES),
        ),
      )
      .returning({ id: configVersions.id })
    return updated ? 'unavailable' : 'sent'
  }

  const [claimed] = await database
    .update(configVersions)
    .set({ rejectionEmailStatus: 'sending', rejectionEmailError: null })
    .where(
      and(
        eq(configVersions.id, versionId),
        eq(configVersions.status, 'rejected'),
        inArray(configVersions.rejectionEmailStatus, UNSENT_REJECTION_EMAIL_STATUSES),
      ),
    )
    .returning({ id: configVersions.id })
  if (!claimed) throw new HttpError(409, 'rejection email delivery is already in progress')

  const input: RejectionEmailInput = {
    versionId,
    authorName: row.authorName,
    authorEmail: row.authorEmail,
    title: row.title,
    reason: row.reason,
    slug: row.slug,
  }
  try {
    const result = await send(input)
    await database
      .update(configVersions)
      .set({
        rejectionEmailStatus: 'sent',
        rejectionEmailId: result.id,
        rejectionEmailError: null,
        rejectionEmailSentAt: new Date(),
      })
      .where(
        and(
          eq(configVersions.id, versionId),
          eq(configVersions.status, 'rejected'),
          eq(configVersions.rejectionEmailStatus, 'sending'),
        ),
      )
    return 'sent'
  } catch (error) {
    const delivery = error instanceof ReviewEmailProviderError ? 'failed' : 'ambiguous'
    const [updated] = await database
      .update(configVersions)
      .set({
        rejectionEmailStatus: delivery,
        rejectionEmailError:
          delivery === 'failed' ? 'Email delivery failed' : 'Email delivery could not be confirmed',
        rejectionEmailSentAt: null,
      })
      .where(
        and(
          eq(configVersions.id, versionId),
          eq(configVersions.status, 'rejected'),
          eq(configVersions.rejectionEmailStatus, 'sending'),
        ),
      )
      .returning({ id: configVersions.id })
    return updated ? delivery : 'sent'
  }
}

export async function rejectAndEmailVersion(
  database: Db,
  versionId: string,
  reviewerId: string,
  reason: string,
  send: SendRejectionEmail = sendRejectionEmail,
): Promise<{ delivery: RejectionEmailStatus }> {
  await rejectVersion(database, versionId, reviewerId, reason)
  return { delivery: await deliverRejectionEmail(database, versionId, send) }
}

export async function retryRejectionEmail(
  database: Db,
  versionId: string,
  send: SendRejectionEmail = sendRejectionEmail,
): Promise<{ delivery: RejectionEmailStatus }> {
  return { delivery: await deliverRejectionEmail(database, versionId, send) }
}
