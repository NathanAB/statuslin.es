import { createFileRoute } from '@tanstack/react-router'
import { adminModDesktopPreviewResponseForRoute } from '@/review/mod-desktop-preview'

export const Route = createFileRoute('/admin/mod-previews/$versionId/desktop.png')({
  server: {
    handlers: {
      GET: async ({ params, request }) =>
        adminModDesktopPreviewResponseForRoute(request.headers, params.versionId),
    },
  },
})
