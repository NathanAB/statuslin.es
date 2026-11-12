import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const getGalleryCatalogueMods = vi.hoisted(() => vi.fn())
const captureServerEvent = vi.hoisted(() => vi.fn())

vi.mock('@tanstack/react-start', () => ({ createServerOnlyFn: (fn: unknown) => fn }))
vi.mock('@/db', () => ({ db: { name: 'database' } }))
vi.mock('@/mods/gallery-queries', () => ({ getGalleryCatalogueMods }))
vi.mock('@/lib/posthog-server', () => ({ captureServerEvent }))

const { galleryCatalogueResponseForRoute } = await import('@/mods/gallery-catalogue-response')

const MOD = {
  slug: 'context-meter',
  title: 'Context Meter',
  description: 'A context meter',
  authorGithub: 'octocat',
  copyCount: 5,
  tags: [],
  license: null,
  footprint: { events: [], calls: [] },
  preview: null,
  desktop: null,
  generatedContent: null,
}

beforeEach(() => {
  vi.stubEnv('BETTER_AUTH_URL', 'https://staging.statuslin.es/')
  getGalleryCatalogueMods.mockReset().mockResolvedValue([MOD])
  captureServerEvent.mockReset()
})
afterEach(() => {
  vi.unstubAllEnvs()
})

describe('galleryCatalogueResponseForRoute', () => {
  it('serves the catalogue as public, cacheable JSON any origin can read', async () => {
    const response = await galleryCatalogueResponseForRoute(null)

    expect(getGalleryCatalogueMods).toHaveBeenCalledTimes(1)
    expect(getGalleryCatalogueMods).toHaveBeenCalledWith({ name: 'database' })
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toMatch(/^application\/json/)
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=300')
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
    const body = await response.json()
    expect(body.marketplaceUrl).toBe('https://staging.statuslin.es/marketplace.json')
    expect(body.mods.map((mod: { url: string }) => mod.url)).toEqual([
      'https://staging.statuslin.es/mods/context-meter',
    ])
  })

  it('answers 200 with an empty list when nothing is published', async () => {
    getGalleryCatalogueMods.mockResolvedValue([])

    const response = await galleryCatalogueResponseForRoute(null)

    expect(response.status).toBe(200)
    expect((await response.json()).mods).toEqual([])
  })

  it('logs one server-side analytics event per fetch', async () => {
    await galleryCatalogueResponseForRoute('Claude-Code-Plugin-Manager/1.0')
    await galleryCatalogueResponseForRoute(null)

    expect(captureServerEvent).toHaveBeenCalledTimes(2)
    expect(captureServerEvent).toHaveBeenNthCalledWith(1, 'gallery_fetched', 'gallery', {
      modCount: 1,
      client: 'claude-code',
      $process_person_profile: false,
    })
  })
})
