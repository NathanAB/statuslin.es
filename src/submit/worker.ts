import { and, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { configs, configVersions, renderJobs, submissions } from '@/db/schema'
import { renderConfig } from '@/render/pipeline'
import { storePreviews } from '@/render/store'
import type { Interpreter, SandboxRunner } from '@/render/types'
import type { RenderJobReport } from '@/submit/render-completed-event'

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

/** How long a job may stay 'running' before it counts as cut off. A render is 8 scenarios, each in
 * its own sandbox capped at 45 seconds, so a live render never gets near this. */
export const STALE_RUNNING_JOB_MS = 15 * 60 * 1000

/** How many times a job may be claimed. A job cut off on its last attempt fails instead of going
 * back to the queue, so a render that keeps killing its machine can't loop forever. */
export const MAX_RENDER_ATTEMPTS = 3

/** Reset jobs that have been 'running' longer than STALE_RUNNING_JOB_MS: the machine rendering
 * them was stopped or crashed. Several web machines render at once, so a younger 'running' job may
 * be live on another machine and is left alone. A job with no start time was left by the old
 * always-on worker. Each goes where `afterCutOff` sends it. Returns how many it moved. */
export async function requeueStaleJobs(db: Db): Promise<number> {
  const isStale = isCutOff()
  const stale = await db
    .select({
      id: renderJobs.id,
      attempts: renderJobs.attempts,
      networkHosts: configVersions.networkHosts,
      submissionStatus: submissions.status,
    })
    .from(renderJobs)
    .innerJoin(configVersions, eq(configVersions.id, renderJobs.configVersionId))
    .leftJoin(submissions, eq(submissions.configVersionId, renderJobs.configVersionId))
    .where(isStale)
  let moved = 0
  for (const job of stale) {
    // Conditional, so a job that finished since the read above keeps its result.
    const updated = await db
      .update(renderJobs)
      .set(afterCutOff(job))
      .where(and(eq(renderJobs.id, job.id), isStale))
      .returning({ id: renderJobs.id })
    moved += updated.length
  }
  return moved
}

/** A job 'running' longer than STALE_RUNNING_JOB_MS, or with no start time (left by the old
 * always-on worker): the machine rendering it was stopped or crashed. */
export function isCutOff() {
  const startedBefore = new Date(Date.now() - STALE_RUNNING_JOB_MS)
  return and(
    eq(renderJobs.status, 'running'),
    or(isNull(renderJobs.startedAt), lt(renderJobs.startedAt, startedBefore)),
  )
}

/** Where a cut-off job goes to render again: 'queued', or 'held' for a NETWORK job (networkHosts
 * non-empty), because a network render must never re-run without a fresh admin click (the
 * held-job invariant). */
export function rerenderStatus(networkHosts: string[] | null): 'queued' | 'held' {
  return (networkHosts ?? []).length > 0 ? 'held' : 'queued'
}

/** Where a job cut off mid-render goes. It fails once its submission is decided (nothing left to
 * review) or it has used MAX_RENDER_ATTEMPTS, and otherwise goes to its `rerenderStatus`. */
function afterCutOff(job: {
  attempts: number
  networkHosts: string[] | null
  submissionStatus: string | null
}): Partial<typeof renderJobs.$inferInsert> {
  if (job.submissionStatus !== 'pending') {
    return {
      status: 'failed',
      error: 'cut off after its submission was decided',
      finishedAt: new Date(),
    }
  }
  if (job.attempts >= MAX_RENDER_ATTEMPTS) {
    return { status: 'failed', error: `cut off ${job.attempts} times`, finishedAt: new Date() }
  }
  return { status: rerenderStatus(job.networkHosts) }
}

/** Called once per finished job (done or failed). Lets the web server's drain report telemetry
 * without the seed/e2e scripts that also call processNextRenderJob emitting it too. */
type OnJobFinished = (report: RenderJobReport) => void

export async function processNextRenderJob(
  db: Db,
  runner: SandboxRunner,
  onJobFinished?: OnJobFinished,
): Promise<string | null> {
  const claimed = await claimNextJob(db)
  if (!claimed) return null
  const startedMs = Date.now()
  let config: { configId: string; slug: string } | null = null
  let scenarios: RenderJobReport['scenarios'] = null
  try {
    const [row] = await db
      .select({ ver: configVersions, slug: configs.slug })
      .from(configVersions)
      .innerJoin(configs, eq(configs.id, configVersions.configId))
      .where(eq(configVersions.id, claimed.configVersionId))
    if (!row) throw new Error(`config version ${claimed.configVersionId} not found`)
    const { ver } = row
    config = { configId: ver.configId, slug: row.slug }
    const previews = await renderConfig(
      {
        script: ver.source,
        interpreter: ver.interpreter as Interpreter,
        networkHosts: ver.networkHosts ?? [],
        readsClaudeToken: ver.readsClaudeToken ?? false,
      },
      runner,
    )
    await storePreviews(db, ver.contentSha256, previews)
    await db
      .update(renderJobs)
      .set({ status: 'done', finishedAt: new Date() })
      .where(isStillClaimed(claimed))
    // Exit status only — never stdout/stderr, which are untrusted script output.
    scenarios = previews.map(({ exitCode, timedOut }) => ({ exitCode, timedOut }))
  } catch (error) {
    await db
      .update(renderJobs)
      .set({ status: 'failed', error: String(error).slice(0, 2000), finishedAt: new Date() })
      .where(isStillClaimed(claimed))
  }
  onJobFinished?.({
    configId: config?.configId ?? null,
    versionId: claimed.configVersionId,
    slug: config?.slug ?? null,
    durationMs: Date.now() - startedMs,
    scenarios,
  })
  return claimed.id
}

/** Drain the queue: re-queue stale jobs, then render every queued job, one at a time, until none
 * remain. Returns the number processed. Per-job render failures are recorded inside
 * processNextRenderJob, so they don't stop the drain — only an infra error (DB/E2B
 * unreachable) throws out of here, which the caller's drain controller catches. */
export async function drainRenderJobs(
  db: Db,
  runner: SandboxRunner,
  onJobFinished?: OnJobFinished,
): Promise<number> {
  await requeueStaleJobs(db)
  let processed = 0
  while (await processNextRenderJob(db, runner, onJobFinished)) processed++
  return processed
}

/** Cheap queue-depth read for the drain telemetry. Run at drain end, when Neon is already awake —
 * so it adds no new wake cost. oldestQueuedAgeSec is 0 when nothing is queued. */
export async function queueDepthStats(
  db: Db,
): Promise<{ queuedRemaining: number; oldestQueuedAgeSec: number }> {
  const rows = await db
    .select({
      count: sql<number>`count(*)::int`,
      oldest: sql<Date | null>`min(${renderJobs.createdAt})`,
    })
    .from(renderJobs)
    .where(eq(renderJobs.status, 'queued'))
  const { count, oldest } = rows[0] ?? { count: 0, oldest: null }
  const oldestQueuedAgeSec = oldest
    ? Math.floor((Date.now() - new Date(oldest).getTime()) / 1000)
    : 0
  return { queuedRemaining: count, oldestQueuedAgeSec }
}

/** Claim the oldest queued job. Several drains claim at once, so the pick skips a job another
 * drain is claiming right now and takes the next one, rather than losing the race and stopping. */
async function claimNextJob(db: Db): Promise<JobClaim | null> {
  const oldestQueued = db
    .select({ id: renderJobs.id })
    .from(renderJobs)
    .where(eq(renderJobs.status, 'queued'))
    .orderBy(renderJobs.createdAt)
    .limit(1)
    .for('update', { skipLocked: true })
  const startedAt = new Date()
  const [claimed] = await db
    .update(renderJobs)
    .set({ status: 'running', startedAt, attempts: sql`${renderJobs.attempts} + 1` })
    .where(and(inArray(renderJobs.id, oldestQueued), eq(renderJobs.status, 'queued')))
    .returning({ id: renderJobs.id, configVersionId: renderJobs.configVersionId })
  return claimed ? { ...claimed, startedAt } : null
}

type JobClaim = { id: string; configVersionId: string; startedAt: Date }

/** The job is still the claim this drain made. A slow render can be re-queued as cut off and
 * claimed again elsewhere; then this run's result must not overwrite that one's. */
function isStillClaimed(claim: JobClaim) {
  return and(
    eq(renderJobs.id, claim.id),
    eq(renderJobs.status, 'running'),
    eq(renderJobs.startedAt, claim.startedAt),
  )
}
