/**
 * The most sandboxes our E2B key runs at once. Every sandbox this process starts waits for a place
 * under it, however the run nests its mods, themes and recordings; past it E2B refuses with "Rate
 * limit exceeded".
 */
const E2B_SANDBOX_LIMIT = 20
let running = 0
const waiting: (() => void)[] = []

/**
 * Creates a sandbox once fewer than E2B_SANDBOX_LIMIT are running, hands it to `use`, kills it once
 * `use` settles, and frees its place, or frees it at once if it fails to start. No caller holds one
 * sandbox while it waits for another, so waiting can't deadlock.
 */
export async function withLimitedSandbox<S extends { kill(): Promise<unknown> }, T>(
  create: () => Promise<S>,
  use: (sandbox: S) => Promise<T>,
): Promise<T> {
  while (running >= E2B_SANDBOX_LIMIT) {
    await new Promise<void>((resolve) => waiting.push(resolve))
  }
  running++
  try {
    const sandbox = await create()
    try {
      return await use(sandbox)
    } finally {
      await sandbox.kill().catch(() => {})
    }
  } finally {
    running--
    waiting.shift()?.()
  }
}
