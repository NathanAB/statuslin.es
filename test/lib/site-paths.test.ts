import { createRouter } from '@tanstack/react-router'
import { describe, expect, it } from 'vitest'
import {
  CONFIG_DESKTOP_PREVIEW_ROUTE,
  configDesktopPreviewPath,
  MARKETPLACE_PATH,
  MOD_DESKTOP_PREVIEW_ROUTE,
  MOD_ROUTE,
  modDesktopPreviewPath,
  modPath,
} from '@/lib/site'
import { Route as ConfigDesktopPreviewRoute } from '@/routes/config-previews.$versionId.desktop[.]png'
import { Route as MarketplaceRoute } from '@/routes/marketplace[.]json'
import { Route as DesktopPreviewRoute } from '@/routes/mod-previews.$versionId.desktop[.]png'
import { Route as ModRoute } from '@/routes/mods.$slug'
import { routeTree } from '@/routeTree.gen'

const { routesByPath } = createRouter({ routeTree })

describe('site paths', () => {
  it('names the route that serves mod pages', () => {
    expect(routesByPath[MOD_ROUTE]).toBe(ModRoute)
  })

  it("fills the mod route's slug", () => {
    expect(modPath('filetree')).toBe('/mods/filetree')
  })

  it('fills the slug as written, not as a replacement pattern', () => {
    expect(modPath("a$'b")).toBe("/mods/a$'b")
  })

  it('names the route that serves Desktop preview images', () => {
    expect(routesByPath[MOD_DESKTOP_PREVIEW_ROUTE]).toBe(DesktopPreviewRoute)
  })

  it("fills the Desktop preview route's version id and names the render, so a re-render is a new URL", () => {
    expect(modDesktopPreviewPath('v-1', new Date(1_700_000_000_000))).toBe(
      '/mod-previews/v-1/desktop.png?r=1700000000000',
    )
  })

  it('fills the version id as written, not as a replacement pattern', () => {
    expect(modDesktopPreviewPath('v$&1', new Date(1_700_000_000_000))).toBe(
      '/mod-previews/v$&1/desktop.png?r=1700000000000',
    )
  })

  it("names a version's card image on the same route, with the same render", () => {
    expect(modDesktopPreviewPath('v-1', new Date(1_700_000_000_000), 'card')).toBe(
      '/mod-previews/v-1/desktop.png?r=1700000000000&image=card',
    )
  })

  it('names the route that serves status line Desktop preview images', () => {
    expect(routesByPath[CONFIG_DESKTOP_PREVIEW_ROUTE]).toBe(ConfigDesktopPreviewRoute)
  })

  it("fills a status line version's Desktop preview path as written, naming the render", () => {
    expect(configDesktopPreviewPath('v$&1', new Date(1_700_000_000_000))).toBe(
      '/config-previews/v$&1/desktop.png?r=1700000000000',
    )
  })

  it('names the route that serves the marketplace', () => {
    expect(routesByPath[MARKETPLACE_PATH]).toBe(MarketplaceRoute)
  })
})
