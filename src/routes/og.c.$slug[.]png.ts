import { createFileRoute } from '@tanstack/react-router'
import { configCardResponseForRoute } from '@/og/routes'

export const Route = createFileRoute('/og/c/$slug.png')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        // TanStack Router's file-route generator types the param as "slug.png" (the dot is included
        // in the param name because the path segment is "$slug.png"). Strip the ".png" suffix so
        // configCardResponseForRoute receives just the slug (e.g. "my-config" not "my-config.png").
        // The replace is a no-op if the runtime strips the suffix itself.
        const slug = params['slug.png'].replace(/\.png$/, '')
        return configCardResponseForRoute(slug)
      },
    },
  },
})
