import { createFileRoute } from '@tanstack/react-router'
import { homeCardResponse } from '@/og/routes'

export const Route = createFileRoute('/og/home.png')({
  server: { handlers: { GET: async () => homeCardResponse() } },
})
