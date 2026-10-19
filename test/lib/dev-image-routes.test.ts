import { readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DEV_IMAGE_ROUTE_PREFIXES } from '@/lib/dev-image-routes'

const ROUTES_DIR = 'src/routes'

/** `admin/mod-previews.$versionId.desktop[.]png.ts` → `/admin/mod-previews/`: its first URL segment. */
const firstSegment = (file: string) => `/${file.slice(0, file.indexOf('.'))}/`

describe('DEV_IMAGE_ROUTE_PREFIXES', () => {
  it('covers every image route, so the dev server hands its requests to the app', () => {
    const imageRoutes = readdirSync(ROUTES_DIR, { recursive: true, encoding: 'utf8' }).filter(
      (file) => file.endsWith('[.]png.ts'),
    )
    expect(imageRoutes.length).toBeGreaterThan(0)
    for (const file of imageRoutes) {
      expect(DEV_IMAGE_ROUTE_PREFIXES, file).toContain(firstSegment(file))
    }
  })
})
