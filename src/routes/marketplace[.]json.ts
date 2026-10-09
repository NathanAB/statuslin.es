import { createFileRoute } from '@tanstack/react-router'

import { marketplaceResponseForRoute } from '@/mods/marketplace-response'

export const Route = createFileRoute('/marketplace.json')({
  server: {
    handlers: {
      GET: async () => marketplaceResponseForRoute(),
    },
  },
})
