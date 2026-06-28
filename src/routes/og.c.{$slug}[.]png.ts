import { createFileRoute } from '@tanstack/react-router'
import { configCardResponseForRoute } from '@/og/routes'

// The `{$slug}.png` segment is a path param with a static `.png` suffix, so the param is named
// `slug` and its value excludes the suffix (e.g. "/og/c/my-config.png" → slug "my-config").
export const Route = createFileRoute('/og/c/{$slug}.png')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        return configCardResponseForRoute(params.slug)
      },
    },
  },
})
