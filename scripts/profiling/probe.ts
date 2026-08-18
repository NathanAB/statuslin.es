import { appendFileSync } from 'node:fs'

/**
 * Profiling-only probe. Attached with Bun's `--preload` or Node's `--import` ONLY by the profiling
 * scripts — production runs the server plain (`bun run .output/server/index.mjs`, see Dockerfile),
 * so this never loads there. It samples event-loop lag and each process memory category, appending
 * to the CSV named by PROFILE_PROBE_OUT. No-ops if that env var is unset, so even an accidental
 * preload does nothing.
 */
const out = process.env.PROFILE_PROBE_OUT
if (out) {
  const INTERVAL_MS = 200
  appendFileSync(
    out,
    'iso,elapsed_ms,loop_lag_ms,rss_mb,heap_used_mb,heap_total_mb,external_mb,array_buffers_mb\n',
  )
  const start = performance.now()
  let last = start
  setInterval(() => {
    const now = performance.now()
    const lagMs = Math.max(0, now - last - INTERVAL_MS)
    last = now
    const memory = process.memoryUsage()
    const mb = (bytes: number) => Math.round(bytes / 1024 / 1024)
    appendFileSync(
      out,
      `${new Date().toISOString()},${Math.round(now - start)},${lagMs.toFixed(1)},${mb(memory.rss)},${mb(memory.heapUsed)},${mb(memory.heapTotal)},${mb(memory.external)},${mb(memory.arrayBuffers)}\n`,
    )
  }, INTERVAL_MS)

  // End the run with a CLEAN exit — that's what flushes Bun's --cpu-prof / --heap-prof. A SIGTERM
  // or SIGINT does NOT flush (and the nitro server ignores them), which is what orphaned a server
  // earlier. The orchestrator sends SIGUSR2 when load is done; the timeout is a hard backstop so a
  // profiled server can never outlive the run.
  process.on('SIGUSR2', () => process.exit(0))
  setTimeout(() => process.exit(0), Number(process.env.PROFILE_MAX_MS) || 120_000)
}
