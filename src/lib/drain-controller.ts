/** Serialize and coalesce drains. trigger() starts a drain; triggers that arrive while a
 * drain is in flight set a pending flag so exactly one more drain runs afterward (catching
 * any job enqueued mid-drain) instead of piling up concurrent drains. A rejected drain is
 * reported via onError and leaves the controller usable. */
export function createDrainController(
  drain: () => Promise<unknown>,
  onError: (error: unknown) => void = () => {},
): { trigger: () => void } {
  let running = false
  let pending = false

  async function run(): Promise<void> {
    running = true
    try {
      do {
        pending = false
        await drain()
      } while (pending)
    } catch (error) {
      onError(error)
    } finally {
      running = false
    }
    // A trigger that landed during the error/teardown window still gets honored.
    if (pending) void run()
  }

  return {
    trigger() {
      if (running) {
        pending = true
        return
      }
      void run()
    },
  }
}
