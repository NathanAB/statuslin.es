import { RouterProvider } from '@tanstack/react-router'
import { hydrateStart } from '@tanstack/react-start/client'
import { StrictMode, startTransition } from 'react'
import { hydrateRoot } from 'react-dom/client'

import { hydrateWhenRouteCodeLoads } from '@/lib/hydrate-when-route-code-loads'

// TanStack Start's default client entry, except that hydration waits for the first page's route
// code (see hydrate-when-route-code-loads). RouterProvider stands in for StartClient on purpose:
// StartClient runs hydrateStart() itself, so the entry couldn't check the router before hydrating.
const router = await hydrateStart()
await hydrateWhenRouteCodeLoads(router, () => {
  startTransition(() => {
    hydrateRoot(
      document,
      <StrictMode>
        <RouterProvider router={router} />
      </StrictMode>,
    )
  })
})
