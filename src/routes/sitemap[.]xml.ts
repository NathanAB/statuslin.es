import { createFileRoute } from '@tanstack/react-router'

import { sitemapResponseForRoute } from '@/gallery/functions'

export const Route = createFileRoute('/sitemap.xml')({
  server: {
    handlers: {
      GET: async () => sitemapResponseForRoute(),
    },
  },
})
