import { createFileRoute } from '@tanstack/react-router'
import { paletteCardResponseForRoute } from '@/og/routes'

export const Route = createFileRoute('/og/themes/{$palette}.png')({
  server: {
    handlers: { GET: async ({ params }) => paletteCardResponseForRoute(params.palette) },
  },
})
