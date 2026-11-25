import { createFileRoute } from '@tanstack/react-router'
import { themeDesktopPreviewResponseForRoute } from '@/themes/desktop-preview-image'

export const Route = createFileRoute('/theme-previews/$themeId/desktop.png')({
  server: {
    handlers: {
      GET: async ({ params, request }) =>
        themeDesktopPreviewResponseForRoute(params.themeId, new URL(request.url).search),
    },
  },
})
