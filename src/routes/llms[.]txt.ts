import { createFileRoute } from '@tanstack/react-router'

import { llmsTxtResponseForRoute } from '@/gallery/functions'

export const Route = createFileRoute('/llms.txt')({
  server: {
    handlers: {
      GET: async () => llmsTxtResponseForRoute(),
    },
  },
})
