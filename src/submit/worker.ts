import { and, eq, sql } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { configs, configVersions, renderJobs } from '@/db/schema'
import { renderConfig } from '@/render/pipeline'
import { storePreviews } from '@/render/store'
import type { Interpreter, SandboxRunner } from '@/render/types'
import type { RenderJobReport } from '@/submit/render-completed-event'

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

/** Reset jobs left 'running' by a crashed worker. An OFFLINE job goes back to 'queued'. A NETWORK
 * job (networkHosts non-empty) goes back to 'held' — a network render must never re-run without a
 * fresh admin click (the held-job invariant). Run at worker startup. */
export async function requeueStaleJobs(db: Db): Promise<number> {
  const stale = await db
    .select({ id: renderJobs.id, networkHosts: configVersions.networkHosts })
    .from(renderJobs)
    .innerJoin(configVersions, eq(configVersions.id, renderJobs.configVersionId))
    .where(eq(renderJobs.status, 'running'))
  for (const job of stale) {
    const next = (job.networkHosts ?? []).length > 0 ? 'held' : 'queued'
    await db.update(renderJobs).set({ status: next }).where(eq(renderJobs.id, job.id))
  }
  return stale.length
}

/** Called once per finished job (done or failed). Lets the worker report telemetry without the
 * seed/e2e scripts that also call processNextRenderJob emitting it too. */
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
      .where(eq(renderJobs.id, claimed.id))
    // Exit status only — never stdout/stderr, which are untrusted script output.
    scenarios = previews.map(({ exitCode, timedOut }) => ({ exitCode, timedOut }))
  } catch (error) {
    await db
      .update(renderJobs)
      .set({ status: 'failed', error: String(error).slice(0, 2000), finishedAt: new Date() })
      .where(eq(renderJobs.id, claimed.id))
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

/** Drain the queue: render every queued job, one at a time, until none remain.
 * Returns the number processed. Per-job render failures are recorded inside
 * processNextRenderJob, so they don't stop the drain — only an infra error (DB/E2B
 * unreachable) throws out of here, which the caller's drain controller catches. */
export async function drainRenderJobs(
  db: Db,
  runner: SandboxRunner,
  onJobFinished?: OnJobFinished,
): Promise<number> {
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

async function claimNextJob(db: Db): Promise<{ id: string; configVersionId: string } | null> {
  const [next] = await db
    .select({ id: renderJobs.id, configVersionId: renderJobs.configVersionId })
    .from(renderJobs)
    .where(eq(renderJobs.status, 'queued'))
    .orderBy(renderJobs.createdAt)
    .limit(1)
  if (!next) return null
  const updated = await db
    .update(renderJobs)
    .set({ status: 'running', attempts: sql`${renderJobs.attempts} + 1` })
    .where(and(eq(renderJobs.id, next.id), eq(renderJobs.status, 'queued')))
    .returning({ id: renderJobs.id })
  if (updated.length === 0) return null
  return next
}
