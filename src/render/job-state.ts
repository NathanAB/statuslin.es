import { and, eq, isNull, lt, or } from 'drizzle-orm'
import { renderJobs } from '@/db/schema'

/** How long a job may stay 'running' before it counts as cut off. A render is 8 scenarios, each in
 * its own sandbox capped at 45 seconds, so a live render never gets near this. */
export const STALE_RUNNING_JOB_MS = 15 * 60 * 1000

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
