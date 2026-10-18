import { createFileRoute } from '@tanstack/react-router'
import { configDesktopPreviewResponseForRoute } from '@/gallery/desktop-preview-image'

export const Route = createFileRoute('/config-previews/$versionId/desktop.png')({
  server: {
    handlers: {
      GET: async ({ params, request }) =>
        configDesktopPreviewResponseForRoute(
          params.versionId,
          new URL(request.url).searchParams.get('r'),
        ),
    },
  },
})
