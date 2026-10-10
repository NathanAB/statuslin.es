import { createFileRoute } from '@tanstack/react-router'
import { modDesktopPreviewResponseForRoute } from '@/mods/desktop-preview-image'

export const Route = createFileRoute('/mod-previews/$versionId/desktop.png')({
  server: {
    handlers: {
      GET: async ({ params, request }) =>
        modDesktopPreviewResponseForRoute(
          params.versionId,
          new URL(request.url).searchParams.get('r'),
        ),
    },
  },
})
