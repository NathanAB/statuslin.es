import { createFileRoute } from '@tanstack/react-router'

import { sitemapWithModsForRoute } from '@/mods/discovery'

export const Route = createFileRoute('/sitemap.xml')({
  server: {
    handlers: {
      GET: async () => sitemapWithModsForRoute(),
    },
  },
})
