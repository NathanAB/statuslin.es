/** Warm-up runs before the captured render for network configs. Network status lines commonly
 *  fetch on first run and only render the fetched values from an on-disk cache on a LATER run (see
 *  the weather/Bitcoin configs). A one-shot sandbox has an empty cache, so a single run always
 *  shows placeholders. Warming the script's own cache with a throwaway run first, then capturing,
 *  makes the preview show the live values a real user sees from their second prompt on. */

/** One warm pass is enough for the fetch-then-cache pattern: run 1 populates the cache, run 2
 *  reads it. */
export const WARMUP_PASSES = 1

/** Run `runOnce` `warmupPasses` times discarding the output (best-effort — a throwing warm-up is
 *  swallowed), then run it once more and return that capture. With 0 passes it's a single run.
 *  Pure orchestration over an injected runner so it's unit-testable without a real sandbox. */
export async function warmThenCapture<T>(
  runOnce: () => Promise<T>,
  warmupPasses: number,
): Promise<T> {
  for (let i = 0; i < warmupPasses; i++) {
    await runOnce().catch(() => {})
  }
  return runOnce()
}
