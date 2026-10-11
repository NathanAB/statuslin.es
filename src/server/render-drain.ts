import { db } from '@/db'
import { createDrainController } from '@/lib/drain-controller'
import { requireEnv } from '@/lib/env'
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

/** The fake runner only on an explicit RENDER_RUNNER=fake, so a server missing its E2B key fails
 * the drain instead of rendering fake previews. */
function sandboxRunner(): SandboxRunner {
  if (process.env.RENDER_RUNNER === 'fake') return new FakeSandboxRunner()
  requireEnv('E2B_API_KEY')
  return new E2BSandboxRunner()
}

async function drainAndReport(): Promise<number> {
  const processed = await drainRenderJobs(db, sandboxRunner(), (report) => {
    const rendered = renderCompletedEvent(report)
    captureServerEvent(rendered.event, rendered.distinctId, rendered.properties)
  })
  const stats = await queueDepthStats(db)
  captureServerEvent('render_queue_drained', RENDER_WORKER_DISTINCT_ID, {
    processed,
    ...stats,
    ...PERSONLESS_EVENT_PROPERTIES,
  })
  return processed
}

const controller = createDrainController(drainAndReport, (error) => {
  captureServerException(error, { source: 'render-drain' })
  // biome-ignore lint/suspicious/noConsole: local dev and staging have no PostHog token, so the server log is the only place a failed drain shows
  console.error('render drain error:', error)
})

/** Render queued status line jobs in this process, in the background (ADR 0006). Returns at once.
 * A trigger during a drain runs one more drain after it, which picks up the new job. */
export function triggerRenderDrain(): void {
  controller.trigger()
}
