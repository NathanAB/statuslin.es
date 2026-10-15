import type { AnyRouter } from '@tanstack/react-router'

/**
 * Hydrates only when the code of every route on the first page loads. When a route chunk fails
 * (a crawler skipped it, a flaky network), the router would swap the good server HTML for the
 * error screen, and Google has indexed that screen instead of the page. Without hydration the page
 * stays as the server rendered it: readable and indexable, with plain links that still navigate.
 * When hydration runs, later in-app navigations keep the error screen.
 */
export async function hydrateWhenRouteCodeLoads(
  router: AnyRouter,
  hydrate: () => void,
): Promise<void> {
  const routes = router.state.matches.map((match) => router.routesById[match.routeId])
  const results = await Promise.allSettled(routes.map((route) => router.loadRouteChunk(route)))
  const routeFilesLoaded = results.every((result) => result.status === 'fulfilled')
  // A code-split component's preload() resolves even when its import fails, and only clears
  // itself once the component has loaded. So a preload still present means the import failed.
  // These are the two components loadRouteChunk preloads.
  const componentsLoaded = routes.every(
    (route) => !route.options.component?.preload && !route.options.pendingComponent?.preload,
  )
  if (routeFilesLoaded && componentsLoaded) hydrate()
}
