import { and, eq, inArray } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { configs, configVersions, user } from '@/db/schema'
import { HttpError } from '@/lib/http'
import {
  type RejectionEmailInput,
  type SendRejectionEmail,
  sendRejectionEmail,
} from './rejection-email'

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

export const REJECTION_REASON_MAX = 2000
export type RejectionEmailStatus = 'pending' | 'sent' | 'failed' | 'unavailable'
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

async function deliverRejectionEmail(
  database: Db,
  versionId: string,
  send: SendRejectionEmail,
): Promise<RejectionEmailStatus> {
  const [row] = await database
    .select({
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
  if (row.emailStatus === 'sent') {
    throw new HttpError(409, 'rejection email already sent')
  }
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
          inArray(configVersions.rejectionEmailStatus, UNSENT_REJECTION_EMAIL_STATUSES),
        ),
      )
    return 'sent'
  } catch {
    const [updated] = await database
      .update(configVersions)
      .set({
        rejectionEmailStatus: 'failed',
        rejectionEmailError: 'Email delivery failed',
        rejectionEmailSentAt: null,
      })
      .where(
        and(
          eq(configVersions.id, versionId),
          eq(configVersions.status, 'rejected'),
          inArray(configVersions.rejectionEmailStatus, UNSENT_REJECTION_EMAIL_STATUSES),
        ),
      )
      .returning({ id: configVersions.id })
    return updated ? 'failed' : 'sent'
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
