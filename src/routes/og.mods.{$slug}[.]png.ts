import { createFileRoute } from '@tanstack/react-router'
import { modCardResponseForRoute } from '@/og/routes'

// As for config cards, `{$slug}.png` names the param `slug` without the `.png` suffix.
export const Route = createFileRoute('/og/mods/{$slug}.png')({
  server: {
    handlers: {
      GET: async ({ params }) => modCardResponseForRoute(params.slug),
    },
  },
})
