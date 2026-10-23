import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { queuePostHogClientError } from '@/lib/posthog-client-errors'
import { RouteError } from '@/ui/route-error'
import { routeTree } from './routeTree.gen'

export function getRouter() {
  return createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    // Back restores the scroll position at once. Left to 'auto', a page whose CSS scrolls smoothly
    // (a guide's contents list) glided down from the top to the restored spot.
    scrollRestorationBehavior: 'instant',
    defaultErrorComponent: RouteError,
    defaultOnCatch: queuePostHogClientError,
  })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
