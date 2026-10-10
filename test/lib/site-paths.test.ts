import { createRouter } from '@tanstack/react-router'
import { describe, expect, it } from 'vitest'
import { MARKETPLACE_PATH, MOD_ROUTE, modPath } from '@/lib/site'
import { Route as MarketplaceRoute } from '@/routes/marketplace[.]json'
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

  it('names the route that serves the marketplace', () => {
    expect(routesByPath[MARKETPLACE_PATH]).toBe(MarketplaceRoute)
  })
})
