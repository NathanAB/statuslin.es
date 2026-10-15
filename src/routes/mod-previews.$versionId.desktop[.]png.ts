import { createFileRoute } from '@tanstack/react-router'
import { modDesktopPreviewResponseForRoute } from '@/mods/desktop-preview-image'

export const Route = createFileRoute('/mod-previews/$versionId/desktop.png')({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const query = new URL(request.url).searchParams
        return modDesktopPreviewResponseForRoute(
          params.versionId,
          query.get('r'),
          query.get('image'),
        )
      },
    },
  },
})
