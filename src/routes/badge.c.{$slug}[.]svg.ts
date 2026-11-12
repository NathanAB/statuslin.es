import { createFileRoute } from '@tanstack/react-router'
import { configBadgeResponseForRoute } from '@/badge/routes'

// As for the og cards, `{$slug}.svg` names the param `slug` without the `.svg` suffix.
export const Route = createFileRoute('/badge/c/{$slug}.svg')({
  server: {
    handlers: {
      GET: async ({ params }) => configBadgeResponseForRoute(params.slug),
    },
  },
})
