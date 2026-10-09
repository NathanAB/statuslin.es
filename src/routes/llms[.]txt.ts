import { createFileRoute } from '@tanstack/react-router'

import { llmsTxtWithModsForRoute } from '@/mods/discovery'

export const Route = createFileRoute('/llms.txt')({
  server: {
    handlers: {
      GET: async () => llmsTxtWithModsForRoute(),
    },
  },
})
