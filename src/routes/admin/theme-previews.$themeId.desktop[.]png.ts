import { createFileRoute } from '@tanstack/react-router'
import { adminThemeDesktopPreviewResponseForRoute } from '@/review/theme-desktop-preview'

export const Route = createFileRoute('/admin/theme-previews/$themeId/desktop.png')({
  server: {
    handlers: {
      GET: async ({ params, request }) =>
        adminThemeDesktopPreviewResponseForRoute(request.headers, params.themeId),
    },
  },
})
