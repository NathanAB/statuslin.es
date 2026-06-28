/** Port the render worker listens on for wake pings, over Fly's private network (6PN).
 * Not a public port and not declared in fly.toml — 6PN allows any port between machines
 * in the same Fly app. Defined once here; imported by both the worker and the web side. */
export const WAKE_PORT = 8081
export const WAKE_PATH = '/wake'

/** What the worker's wake server binds to. On Fly it must bind `fly-local-6pn` (the 6PN
 * equivalent of localhost) to be reachable from the web process; locally, plain loopback. */
export function wakeServerHostname(env: NodeJS.ProcessEnv): string {
  return env.FLY_APP_NAME ? 'fly-local-6pn' : '127.0.0.1'
}

/** The URL the web process posts to in order to wake the worker. On Fly, the worker is
 * reachable at `<process>.process.<app>.internal` over 6PN; locally it's loopback. */
export function workerWakeUrl(env: NodeJS.ProcessEnv): string {
  const host = env.FLY_APP_NAME ? `worker.process.${env.FLY_APP_NAME}.internal` : '127.0.0.1'
  return `http://${host}:${WAKE_PORT}${WAKE_PATH}`
}

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

/** How long the web side waits for the worker to accept a wake ping before giving up.
 * Short: this is on the submission response path, and a miss is recovered by the worker's
 * startup + periodic safety drains. */
const WAKE_PING_TIMEOUT_MS = 1000

/** Best-effort: tell the worker a job was enqueued. Swallows every error (connection
 * refused, timeout, non-2xx) — a missed ping must never fail a submission. */
export async function pingWorkerWake(url: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  try {
    await fetchImpl(url, { method: 'POST', signal: AbortSignal.timeout(WAKE_PING_TIMEOUT_MS) })
  } catch {
    // Intentionally ignored — see the worker's startup and safety-net drains.
  }
}

/** Map an incoming request to a wake action. 202 + onWake() for POST <WAKE_PATH>, else 404.
 * Kept pure (no socket) so it's unit-testable; startWakeServer wires it to Bun.serve. */
export function handleWakeRequest(req: Request, onWake: () => void): Response {
  const { pathname } = new URL(req.url)
  if (req.method === 'POST' && pathname === WAKE_PATH) {
    onWake()
    return new Response(null, { status: 202 })
  }
  return new Response(null, { status: 404 })
}

/** Start the worker's wake listener. Binds Bun.serve on the given host/port and routes every
 * request through handleWakeRequest. Returns the bound port (useful when port is 0) and stop(). */
export function startWakeServer(opts: { hostname: string; port: number; onWake: () => void }): {
  port: number
  stop: () => void
} {
  const server = Bun.serve({
    hostname: opts.hostname,
    port: opts.port,
    fetch: (req) => handleWakeRequest(req, opts.onWake),
  })
  // Bun types server.port as `number | undefined`; the project bans `!` (biome noNonNullAssertion),
  // so narrow it explicitly. At runtime port 0 resolves to the real bound port.
  const port = server.port
  if (port === undefined) throw new Error('Bun.serve did not bind a port')
  return { port, stop: () => server.stop() }
}
