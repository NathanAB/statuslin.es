import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { queuePostHogClientError } from '@/lib/posthog-client-errors'
import { RouteError } from '@/ui/route-error'
import { routeTree } from './routeTree.gen'

export function getRouter() {
  return createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    defaultErrorComponent: RouteError,
    defaultOnCatch: queuePostHogClientError,
  })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
