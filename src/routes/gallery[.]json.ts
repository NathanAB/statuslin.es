import { createFileRoute } from '@tanstack/react-router'

import { galleryCatalogueResponseForRoute } from '@/mods/gallery-catalogue-response'

export const Route = createFileRoute('/gallery.json')({
  server: {
    handlers: {
      GET: async ({ request }) =>
        galleryCatalogueResponseForRoute(request.headers.get('user-agent')),
    },
  },
})
