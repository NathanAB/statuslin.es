import { createFileRoute } from '@tanstack/react-router'
import { themeDesktopPreviewResponseForRoute } from '@/themes/desktop-preview-image'

export const Route = createFileRoute('/theme-previews/$themeId/desktop.png')({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const query = new URL(request.url).searchParams
        return themeDesktopPreviewResponseForRoute(
          params.themeId,
          query.get('r'),
          query.get('image'),
        )
      },
    },
  },
})
