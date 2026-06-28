import { createFileRoute } from '@tanstack/react-router'

export const healthHandler = async () => Response.json({ ok: true })

export const Route = createFileRoute('/api/health')({
  server: {
    handlers: {
      GET: healthHandler,
    },
  },
})
