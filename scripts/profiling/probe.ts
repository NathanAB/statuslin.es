import { appendFileSync } from 'node:fs'

/**
 * Profiling-only probe. Attached with `bun --preload` ONLY by scripts/profiling/profile-server.ts —
 * production runs the server plain (`bun run .output/server/index.mjs`, see Dockerfile), so this
 * never loads there. It samples event-loop lag (how late a fixed-interval timer fires = the JS
 * thread being blocked) and RSS, appending to the CSV named by PROFILE_PROBE_OUT. No-ops if that
 * env var is unset, so even an accidental preload does nothing.
 */
const out = process.env.PROFILE_PROBE_OUT
if (out) {
  const INTERVAL_MS = 200
  appendFileSync(out, 'iso,elapsed_ms,loop_lag_ms,rss_mb\n')
  const start = performance.now()
  let last = start
  setInterval(() => {
    const now = performance.now()
    const lagMs = Math.max(0, now - last - INTERVAL_MS)
    last = now
    const rssMb = Math.round(process.memoryUsage().rss / 1024 / 1024)
    appendFileSync(
      out,
      `${new Date().toISOString()},${Math.round(now - start)},${lagMs.toFixed(1)},${rssMb}\n`,
    )
  }, INTERVAL_MS)

  // End the run with a CLEAN exit — that's what flushes Bun's --cpu-prof / --heap-prof. A SIGTERM
  // or SIGINT does NOT flush (and the nitro server ignores them), which is what orphaned a server
  // earlier. The orchestrator sends SIGUSR2 when load is done; the timeout is a hard backstop so a
  // profiled server can never outlive the run.
  process.on('SIGUSR2', () => process.exit(0))
  setTimeout(() => process.exit(0), Number(process.env.PROFILE_MAX_MS) || 120_000)
}
