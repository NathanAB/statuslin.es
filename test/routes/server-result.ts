import type { AnyRouter } from '@tanstack/react-router'

/** What TanStack Start's SSR handler answers for the router's last load: it reads
 * `router._serverResult` (createStartHandler in @tanstack/start-server-core) for the redirect or
 * the HTTP status. router-core 1.171 removed the public statusCode and redirect stores. */
export function serverResult(router: AnyRouter) {
  return router._serverResult
}
