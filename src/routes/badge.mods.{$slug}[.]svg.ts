import { createFileRoute } from '@tanstack/react-router'
import { modBadgeResponseForRoute } from '@/badge/routes'

// As for the og cards, `{$slug}.svg` names the param `slug` without the `.svg` suffix.
export const Route = createFileRoute('/badge/mods/{$slug}.svg')({
  server: {
    handlers: {
      GET: async ({ params }) => modBadgeResponseForRoute(params.slug),
    },
  },
})
