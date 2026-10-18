import { createFileRoute } from '@tanstack/react-router'

import { llmsFullTxtWithModsForRoute } from '@/mods/discovery'

export const Route = createFileRoute('/llms-full.txt')({
  server: {
    handlers: {
      GET: async () => llmsFullTxtWithModsForRoute(),
    },
  },
})
