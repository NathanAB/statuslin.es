import { setTimeout as sleep } from 'node:timers/promises'
import { db } from '@/db'
import { requireEnv } from '@/lib/env'
import {
  captureServerEvent,
  captureServerException,
  captureServerExceptionImmediate,
} from '@/lib/posthog-server'
import { createDrainController, startWakeServer, WAKE_PORT, wakeServerHostname } from '@/lib/wake'
import { E2BSandboxRunner } from '@/render/e2b-runner'
import { FakeSandboxRunner } from '@/render/fake-runner'
import type { SandboxRunner } from '@/render/types'
import { drainRenderJobs, queueDepthStats, requeueStaleJobs } from '@/submit/worker'

// Fatal, out-of-loop failures (an async resource erroring, a startup rejection). Capture *immediately*
// (await the send) before exiting — a fire-and-forget event would be lost when the process dies — then
// exit non-zero so Fly restarts the worker. The loop's own try/catch handles in-loop errors instead.
const FATAL_SEND_DEADLINE_MS = 5000
async function reportFatalAndExit(error: unknown, source: string): Promise<never> {
  // Bound the send: a fatal crash often coincides with a network problem, and posthog-node's full
  // retry budget is ~49s. Don't delay the restart that long — race the send against a short deadline.
  await Promise.race([
    captureServerExceptionImmediate(error, { source }),
    sleep(FATAL_SEND_DEADLINE_MS),
  ])
  console.error(`render worker fatal (${source}):`, error)
  process.exit(1)
}
process.on('uncaughtException', (error) => reportFatalAndExit(error, 'uncaught'))
process.on('unhandledRejection', (reason) => reportFatalAndExit(reason, 'unhandled'))

let runner: SandboxRunner
if (process.env.RENDER_RUNNER === 'fake') {
  runner = new FakeSandboxRunner()
} else {
  requireEnv('E2B_API_KEY')
  runner = new E2BSandboxRunner()
}

// Fallback drain in case a wake ping is dropped while the worker is up. Long on purpose: each
// drain wakes the Neon compute, so a short interval would defeat scale-to-zero. 30 min keeps
// idle compute cost low while bounding how long a missed-ping job could sit unrendered.
const SAFETY_DRAIN_MS = 30 * 60 * 1000

async function drainAndReport(): Promise<number> {
  const processed = await drainRenderJobs(db, runner)
  const stats = await queueDepthStats(db)
  captureServerEvent('render_queue_drained', 'render-worker', { processed, ...stats })
  return processed
}

const controller = createDrainController(drainAndReport, (error) => {
  captureServerException(error, { source: 'worker' })
  console.error('render worker drain error:', error)
})

const stale = await requeueStaleJobs(db)
if (stale > 0) console.log(`requeued ${stale} stale running job(s)`)

const hostname = wakeServerHostname(process.env)
startWakeServer({ hostname, port: WAKE_PORT, onWake: () => controller.trigger() })
console.log(`render worker started; wake server on ${hostname}:${WAKE_PORT}`)

// Drain anything already queued (covers jobs whose wake ping arrived while the worker was down).
controller.trigger()

// Safety net for dropped wake pings. Bun.serve + this interval keep the process alive — no poll loop.
setInterval(() => controller.trigger(), SAFETY_DRAIN_MS)

// Liveness heartbeat: a dead-man's switch for the PostHog "worker down" alert. DB-free on purpose —
// a DB poll here would keep the Neon compute warm 24/7 and defeat scale-to-zero. Fires even while a
// render is awaited, so a busy-but-alive worker still heartbeats.
const HEARTBEAT_MS = 5 * 60 * 1000
function emitHeartbeat() {
  captureServerEvent('render_worker_heartbeat', 'render-worker')
}
emitHeartbeat() // one at startup, then on the interval
setInterval(emitHeartbeat, HEARTBEAT_MS)
