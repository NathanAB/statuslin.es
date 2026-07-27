import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { and, eq, inArray } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { db } from '@/db'
import { configVersions, renderJobs } from '@/db/schema'
import { HttpError } from '@/lib/http'
import { withHttpStatus } from '@/lib/http.server'
import { getPostHogClient } from '@/lib/posthog-server'
import { pingWorkerWake, workerWakeUrl } from '@/lib/wake'
import { assertAdmin } from './admin'
import { approveAndEmailVersion, retryApprovalEmail } from './approval-delivery'
import { rejectAndEmailVersion, retryRejectionEmail } from './rejection-delivery'

export {
  type ApprovalEmailStatus,
  approveAndEmailVersion,
  approveVersion,
  retryApprovalEmail,
} from './approval-delivery'
export {
  REJECTION_REASON_MAX,
  type RejectionEmailStatus,
  rejectAndEmailVersion,
  rejectVersion,
  retryRejectionEmail,
} from './rejection-delivery'

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

/** Admin disclosure override: set whether a version is flagged as reading the Claude token.
 * INVARIANT: this is only ever invoked from the review queue, which shows pending (unpublished)
 * versions — so a config's materialized `configs.allTags` is (re)computed later at `approveVersion`
 * from the final flag. If a caller is ever added that toggles a *published* config's current version,
 * it MUST also recompute `configs.allTags` here, or the reads-token badge/filter will drift stale. */
export async function setReadsClaudeToken(
  database: Db,
  versionId: string,
  value: boolean,
  reviewerId: string,
): Promise<void> {
  const [row] = await database
    .update(configVersions)
    .set({ readsClaudeToken: value, reviewedBy: reviewerId, reviewedAt: new Date() })
    .where(eq(configVersions.id, versionId))
    .returning()
  if (!row) throw new HttpError(404, 'version not found')
}

/** Re-attempt a render: reset the version's render job to 'queued'. Only a FAILED job may be
 * re-queued — never a 'held' network job (that's runNetworkPreview's job alone), never a still
 * 'queued'/'running' one, and never a 'done' one (already rendered). Clears error + attempts. */
export async function requeueRenderJob(database: Db, versionId: string): Promise<void> {
  const [job] = await database
    .update(renderJobs)
    .set({ status: 'queued', error: null, attempts: 0, finishedAt: null })
    .where(and(eq(renderJobs.configVersionId, versionId), inArray(renderJobs.status, ['failed'])))
    .returning()
  if (!job) throw new HttpError(409, 'no re-queueable render job for that version (must be failed)')
}

/** Admin-gated: run the network preview for a held network version. Promotes the render job
 * 'held' → 'queued' ONLY when it is currently 'held' (errors otherwise), so untrusted code never
 * gets network egress without this explicit human action. */
export async function runNetworkPreview(database: Db, versionId: string): Promise<void> {
  const [job] = await database
    .update(renderJobs)
    .set({ status: 'queued', error: null, attempts: 0, finishedAt: null })
    .where(and(eq(renderJobs.configVersionId, versionId), eq(renderJobs.status, 'held')))
    .returning()
  if (!job) throw new HttpError(409, 'no held render job for that version')
}

export const approveVersionFn = createServerFn({ method: 'POST' })
  .inputValidator((d: { versionId: string }) => d)
  .handler(({ data }) =>
    withHttpStatus(async () => {
      const admin = await assertAdmin(getRequestHeaders())
      const result = await approveAndEmailVersion(db, data.versionId, admin.id)
      getPostHogClient()?.capture({
        distinctId: admin.id,
        event: 'statusline_approved',
        properties: { versionId: data.versionId },
      })
      return result
    }),
  )

export const rejectVersionFn = createServerFn({ method: 'POST' })
  .inputValidator((d: { versionId: string; reason?: string }) => d)
  .handler(({ data }) =>
    withHttpStatus(async () => {
      const admin = await assertAdmin(getRequestHeaders())
      const result = await rejectAndEmailVersion(db, data.versionId, admin.id, data.reason ?? '')
      getPostHogClient()?.capture({
        distinctId: admin.id,
        event: 'statusline_rejected',
        properties: { versionId: data.versionId },
      })
      return result
    }),
  )

export const retryRejectionEmailFn = createServerFn({ method: 'POST' })
  .inputValidator((d: { versionId: string }) => d)
  .handler(({ data }) =>
    withHttpStatus(async () => {
      await assertAdmin(getRequestHeaders())
      return retryRejectionEmail(db, data.versionId)
    }),
  )

export const retryApprovalEmailFn = createServerFn({ method: 'POST' })
  .inputValidator((d: { versionId: string }) => d)
  .handler(({ data }) =>
    withHttpStatus(async () => {
      await assertAdmin(getRequestHeaders())
      return retryApprovalEmail(db, data.versionId)
    }),
  )

export const setReadsClaudeTokenFn = createServerFn({ method: 'POST' })
  .inputValidator((d: { versionId: string; value: boolean }) => d)
  .handler(({ data }) =>
    withHttpStatus(async () => {
      const admin = await assertAdmin(getRequestHeaders())
      await setReadsClaudeToken(db, data.versionId, data.value, admin.id)
    }),
  )

export const requeueRenderJobFn = createServerFn({ method: 'POST' })
  .inputValidator((d: { versionId: string }) => d)
  .handler(({ data }) =>
    withHttpStatus(async () => {
      await assertAdmin(getRequestHeaders())
      await requeueRenderJob(db, data.versionId)
    }),
  )

export const runNetworkPreviewFn = createServerFn({ method: 'POST' })
  .inputValidator((d: { versionId: string }) => d)
  .handler(({ data }) =>
    withHttpStatus(async () => {
      await assertAdmin(getRequestHeaders())
      await runNetworkPreview(db, data.versionId)
      // Best-effort: wake the worker so it renders now instead of on the next safety drain.
      void pingWorkerWake(workerWakeUrl(process.env))
    }),
  )
