import { createFileRoute } from '@tanstack/react-router'
import { themesCardResponseForRoute } from '@/og/routes'

export const Route = createFileRoute('/og/themes.png')({
  server: { handlers: { GET: async () => themesCardResponseForRoute() } },
})
