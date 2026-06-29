import { createFileRoute } from '@tanstack/react-router'

import { robotsResponse } from '@/lib/robots'
import { siteUrl } from '@/lib/site'

export const Route = createFileRoute('/robots.txt')({
  server: {
    handlers: {
      GET: async () => robotsResponse(siteUrl()),
    },
  },
})
