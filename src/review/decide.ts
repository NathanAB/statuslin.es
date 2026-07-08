import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { and, eq, inArray } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { db } from '@/db'
import { configs, configVersions, renderJobs } from '@/db/schema'
import { computeAllTags } from '@/lib/derived-tags'
import { HttpError } from '@/lib/http'
import { withHttpStatus } from '@/lib/http.server'
import { getPostHogClient } from '@/lib/posthog-server'
import { pingWorkerWake, workerWakeUrl } from '@/lib/wake'
import { assertAdmin } from './admin'

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

export async function approveVersion(
  database: Db,
  versionId: string,
  reviewerId: string,
): Promise<void> {
  await database.transaction(async (tx) => {
    const [job] = await tx
      .select()
      .from(renderJobs)
      .where(eq(renderJobs.configVersionId, versionId))
    if (job?.status !== 'done') throw new HttpError(409, 'version not rendered')
    const [ver] = await tx
      .update(configVersions)
      .set({ status: 'approved', reviewedBy: reviewerId, reviewedAt: new Date() })
      .where(and(eq(configVersions.id, versionId), eq(configVersions.status, 'pending')))
      .returning()
    if (!ver) throw new HttpError(409, 'version not in a reviewable (pending) state')
    const [cfg] = await tx
      .select({ tags: configs.tags })
      .from(configs)
      .where(eq(configs.id, ver.configId))
    const allTags = computeAllTags({
      curatedTags: cfg?.tags ?? [],
      interpreter: ver.interpreter,
      networkHosts: ver.networkHosts ?? [],
      readsClaudeToken: ver.readsClaudeToken ?? false,
    })
    await tx
      .update(configs)
      .set({ status: 'published', currentVersionId: ver.id, allTags })
      .where(eq(configs.id, ver.configId))
  })
}

export async function rejectVersion(
  database: Db,
  versionId: string,
  reviewerId: string,
): Promise<void> {
  const [row] = await database
    .update(configVersions)
    .set({ status: 'rejected', reviewedBy: reviewerId, reviewedAt: new Date() })
    .where(and(eq(configVersions.id, versionId), eq(configVersions.status, 'pending')))
    .returning()
  if (!row) throw new HttpError(409, 'version not in a reviewable (pending) state')
}

/** Admin disclosure override: set whether a version is flagged as reading the Claude token. */
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
      await approveVersion(db, data.versionId, admin.id)
      getPostHogClient()?.capture({
        distinctId: admin.id,
        event: 'statusline_approved',
        properties: { versionId: data.versionId },
      })
    }),
  )

export const rejectVersionFn = createServerFn({ method: 'POST' })
  .inputValidator((d: { versionId: string }) => d)
  .handler(({ data }) =>
    withHttpStatus(async () => {
      const admin = await assertAdmin(getRequestHeaders())
      await rejectVersion(db, data.versionId, admin.id)
      getPostHogClient()?.capture({
        distinctId: admin.id,
        event: 'statusline_rejected',
        properties: { versionId: data.versionId },
      })
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
