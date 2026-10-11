import { db } from '@/db'
import { createDrainController } from '@/lib/drain-controller'
import { assertNotProduction, requireEnv } from '@/lib/env'
import { captureServerEvent, captureServerException } from '@/lib/posthog-server'
import { E2BSandboxRunner } from '@/render/e2b-runner'
import { FakeSandboxRunner } from '@/render/fake-runner'
import type { SandboxRunner } from '@/render/types'
import {
  PERSONLESS_EVENT_PROPERTIES,
  RENDER_WORKER_DISTINCT_ID,
  renderCompletedEvent,
} from '@/submit/render-completed-event'
import { drainRenderJobs, queueDepthStats } from '@/submit/worker'

/** The fake runner only on an explicit RENDER_RUNNER=fake, and never in production, so a server
 * missing its E2B key fails the drain instead of rendering fake previews. */
function sandboxRunner(): SandboxRunner {
  if (process.env.RENDER_RUNNER === 'fake') {
    assertNotProduction('RENDER_RUNNER=fake')
    return new FakeSandboxRunner()
  }
  requireEnv('E2B_API_KEY')
  return new E2BSandboxRunner()
}

/** Aborted when the machine shuts down. */
const shutdown = new AbortController()

async function drainAndReport(): Promise<void> {
  const { processed, cutOff } = await drainRenderJobs(db, sandboxRunner(), {
    onJobFinished: (report) => {
      const rendered = renderCompletedEvent(report)
      captureServerEvent(rendered.event, rendered.distinctId, rendered.properties)
    },
    stop: shutdown.signal,
  })
  const stats = await queueDepthStats(db)
  captureServerEvent('render_queue_drained', RENDER_WORKER_DISTINCT_ID, {
    processed,
    cutOffJobs: cutOff,
    ...stats,
    ...PERSONLESS_EVENT_PROPERTIES,
  })
}

const controller = createDrainController(drainAndReport, (error) => {
  captureServerException(error, { source: 'render-drain' })
  // biome-ignore lint/suspicious/noConsole: local dev and staging have no PostHog token, so the server log is the only place a failed drain shows
  console.error('render drain error:', error)
})

/** Render queued status line jobs in this process, in the background (ADR 0006). Returns at once.
 * A trigger during a drain runs one more drain after it, which picks up the new job. */
export function triggerRenderDrain(): void {
  stopOnShutdown()
  controller.trigger()
}

/** Put the job being rendered back in the queue, and claim no more, for good. */
export function stopRenderDrain(): void {
  shutdown.abort()
}

/** Fly stops a machine (a deploy, or auto-stop) with SIGINT and kills it 5 s later, so put the
 * job back for the next machine to render now, not after STALE_RUNNING_JOB_MS. Each copy of this
 * module listens for itself (see render-drain-plugin.ts). Only on the deployed images
 * (NODE_ENV=production): locally nothing else handles SIGINT, so listening would keep Ctrl+C from
 * stopping the dev server. */
function stopOnShutdown(): void {
  if (process.env.NODE_ENV !== 'production') return
  if (process.listeners('SIGINT').includes(stopRenderDrain)) return
  process.once('SIGINT', stopRenderDrain)
  process.once('SIGTERM', stopRenderDrain)
}
