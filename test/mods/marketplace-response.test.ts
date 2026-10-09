import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const getMarketplaceRows = vi.hoisted(() => vi.fn())
const captureServerEvent = vi.hoisted(() => vi.fn())

vi.mock('@tanstack/react-start', () => ({ createServerOnlyFn: (fn: unknown) => fn }))
vi.mock('@/db', () => ({ db: { name: 'database' } }))
vi.mock('@/mods/queries', () => ({ getMarketplaceRows }))
vi.mock('@/lib/posthog-server', () => ({ captureServerEvent }))

const { marketplaceResponseForRoute } = await import('@/mods/marketplace-response')

const ROW = {
  slug: 'context-meter',
  pluginName: 'meter',
  description: 'A context meter',
  authorGithub: 'octocat',
  tags: [],
  repoUrl: 'https://github.com/octocat/meter',
  path: '',
  commitSha: 'a'.repeat(40),
  license: null,
}

beforeEach(() => {
  vi.stubEnv('BETTER_AUTH_URL', 'https://staging.statuslin.es/')
  getMarketplaceRows.mockReset().mockResolvedValue([ROW])
  captureServerEvent.mockReset()
})
afterEach(() => {
  vi.unstubAllEnvs()
})

describe('marketplaceResponseForRoute', () => {
  it('serves the marketplace built from the database as JSON', async () => {
    const response = await marketplaceResponseForRoute()

    expect(getMarketplaceRows).toHaveBeenCalledWith({ name: 'database' })
    expect(response.headers.get('Content-Type')).toMatch(/^application\/json/)
    const body = await response.json()
    expect(body.name).toBe('statuslines')
    expect(body.plugins.map((p: { homepage: string }) => p.homepage)).toEqual([
      'https://staging.statuslin.es/mods/context-meter',
    ])
  })

  it('logs one server-side analytics event per fetch', async () => {
    await marketplaceResponseForRoute()
    await marketplaceResponseForRoute()

    expect(captureServerEvent).toHaveBeenCalledTimes(2)
    expect(captureServerEvent).toHaveBeenCalledWith('marketplace_fetched', 'marketplace', {
      pluginCount: 1,
    })
  })
})
