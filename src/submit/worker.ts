import { and, eq, type SQL, sql } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { configs, configVersions, renderJobs, submissions } from '@/db/schema'
import { isCutOff, rerenderStatus } from '@/render/job-state'
import { renderConfig } from '@/render/pipeline'
import { storePreviews } from '@/render/store'
import type { Interpreter, SandboxRunner } from '@/render/types'
import type { RenderJobReport } from '@/submit/render-completed-event'

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

/** How many times a job may be claimed. A job cut off on its last attempt fails instead of going
 * back to the queue, so a render that keeps killing its machine can't loop forever. */
export const MAX_RENDER_ATTEMPTS = 3

/** Reset jobs that have been 'running' longer than STALE_RUNNING_JOB_MS: the machine rendering
 * them was stopped or crashed. Several web machines render at once, so a younger 'running' job may
 * be live on another machine and is left alone. A job with no start time was left by the old
 * always-on worker. Returns how many it moved. */
export function requeueStaleJobs(db: Db): Promise<number> {
  return releaseCutOffJobs(db, isCutOff())
}

/** Send each job matching `which` where `afterCutOff` says. Returns how many it moved. */
async function releaseCutOffJobs(db: Db, which: SQL | undefined): Promise<number> {
  const jobs = await db
    .select({
      id: renderJobs.id,
      attempts: renderJobs.attempts,
      networkHosts: configVersions.networkHosts,
      submissionStatus: submissions.status,
    })
    .from(renderJobs)
    .innerJoin(configVersions, eq(configVersions.id, renderJobs.configVersionId))
    .leftJoin(submissions, eq(submissions.configVersionId, renderJobs.configVersionId))
    .where(which)
  let moved = 0
  for (const job of jobs) {
    // Conditional, so a job that finished since the read above keeps its result.
    const updated = await db
      .update(renderJobs)
      .set(afterCutOff(job))
      .where(and(eq(renderJobs.id, job.id), which))
      .returning({ id: renderJobs.id })
    moved += updated.length
  }
  return moved
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

type DrainOptions = {
  /** Called once per finished job (done or failed). Lets the web server's drain report telemetry
   * without the seed/e2e scripts that also call processNextRenderJob emitting it too. */
  onJobFinished?: (report: RenderJobReport) => void
  /** Aborted when the machine shuts down: the job being rendered goes back as if cut off
   * (`afterCutOff`), and no other job is claimed. */
  stop?: AbortSignal
}

/** Render the oldest queued job. Returns its id, or null when nothing is queued or `stop` ended
 * the render. */
export async function processNextRenderJob(
  db: Db,
  runner: SandboxRunner,
  { onJobFinished, stop }: DrainOptions = {},
): Promise<string | null> {
  if (stop?.aborted) return null
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
    const previews = await untilStopped(
      renderConfig(
        {
          script: ver.source,
          interpreter: ver.interpreter as Interpreter,
          networkHosts: ver.networkHosts ?? [],
          readsClaudeToken: ver.readsClaudeToken ?? false,
        },
        runner,
      ),
      stop,
    )
    await storePreviews(db, ver.contentSha256, previews)
    await db
      .update(renderJobs)
      .set({ status: 'done', finishedAt: new Date() })
      .where(isStillClaimed(claimed))
    // Exit status only — never stdout/stderr, which are untrusted script output.
    scenarios = previews.map(({ exitCode, timedOut }) => ({ exitCode, timedOut }))
  } catch (error) {
    if (error instanceof DrainStopped) {
      await releaseCutOffJobs(db, isStillClaimed(claimed))
      return null
    }
    await db
      .update(renderJobs)
      .set({ status: 'failed', error: failureMessage(error), finishedAt: new Date() })
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

/** Drain the queue: reset cut-off jobs, then render every queued job, one at a time, until none
 * remain. Returns how many jobs it rendered and how many cut-off jobs it reset. Per-job render
 * failures are recorded inside processNextRenderJob, so they don't stop the drain — only an infra
 * error (DB/E2B unreachable) throws out of here, which the caller's drain controller catches. */
export async function drainRenderJobs(
  db: Db,
  runner: SandboxRunner,
  options: DrainOptions = {},
): Promise<{ processed: number; cutOff: number }> {
  const cutOff = await requeueStaleJobs(db)
  let processed = 0
  while (await processNextRenderJob(db, runner, options)) processed++
  return { processed, cutOff }
}

class DrainStopped extends Error {}

/** What the admin sees on a failed job. A failed query's message lists its parameters, which hold
 * the script's output, so record only the error it wraps (the database's own). Checked by `cause`,
 * not `instanceof`, so a second copy of drizzle's error class can't let the parameters through.
 * Postgres can't store a NUL. */
function failureMessage(error: unknown): string {
  const message = String(error instanceof Error && error.cause !== undefined ? error.cause : error)
  return message.replaceAll('\u0000', '').slice(0, 2000)
}

/** `work`, unless `stop` aborts first: then reject with DrainStopped. The work itself carries on
 * until the process exits; its result is dropped. */
function untilStopped<T>(work: Promise<T>, stop: AbortSignal | undefined): Promise<T> {
  if (!stop) return work
  return new Promise((resolve, reject) => {
    const onStop = () => reject(new DrainStopped())
    if (stop.aborted) return onStop()
    stop.addEventListener('abort', onStop, { once: true })
    work.then(resolve, reject).finally(() => stop.removeEventListener('abort', onStop))
  })
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
 * drain is claiming right now and takes the next one, rather than losing the race and stopping.
 * The pick and the update are two statements: as one `UPDATE … WHERE id IN (SELECT … LIMIT 1 FOR
 * UPDATE SKIP LOCKED)`, Postgres can run the subquery once per row it scans, and each run skips
 * the rows this update already took, so one claim took every queued job. */
async function claimNextJob(db: Db): Promise<JobClaim | null> {
  return db.transaction(async (tx) => {
    const [next] = await tx
      .select({ id: renderJobs.id })
      .from(renderJobs)
      .where(eq(renderJobs.status, 'queued'))
      .orderBy(renderJobs.createdAt)
      .limit(1)
      .for('update', { skipLocked: true })
    if (!next) return null
    const startedAt = new Date()
    const [claimed] = await tx
      .update(renderJobs)
      .set({ status: 'running', startedAt, attempts: sql`${renderJobs.attempts} + 1` })
      .where(eq(renderJobs.id, next.id))
      .returning({ id: renderJobs.id, configVersionId: renderJobs.configVersionId })
    return claimed ? { ...claimed, startedAt } : null
  })
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
