import { createFileRoute } from '@tanstack/react-router'

import { securityTxtResponse } from '@/lib/security-txt'

export const Route = createFileRoute('/.well-known/security.txt')({
  server: {
    handlers: {
      GET: async () => securityTxtResponse(),
    },
  },
})
