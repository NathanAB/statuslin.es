// @vitest-environment node
import { createMemoryHistory } from '@tanstack/react-router'
import { describe, expect, it, vi } from 'vitest'
import { serverResult } from './server-result'

const emptySource = vi.fn().mockResolvedValue({ items: [], total: 0 })

vi.mock('@/lib/analytics-config', () => ({
  getAnalyticsToken: vi.fn().mockResolvedValue(null),
}))
vi.mock('@/lib/auth-functions', () => ({
  getSession: vi.fn().mockResolvedValue(null),
}))
vi.mock('@/gallery/functions', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getGalleryConfigs: emptySource,
  getConfigSearchTexts: vi.fn().mockResolvedValue([]),
}))
vi.mock('@/mods/gallery-functions', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getGalleryModsFn: emptySource,
  getModSearchTextsFn: vi.fn().mockResolvedValue([]),
}))
vi.mock('@/home/functions', () => ({
  getHomeShowcaseFn: vi.fn().mockResolvedValue({ hero: [] }),
}))

const { getRouter } = await import('@/router')

async function loadHome(href: string) {
  const router = getRouter()
  router.update({ history: createMemoryHistory({ initialEntries: [href] }) })
  await router.load()
  const result = serverResult(router)
  return result?.type === 'redirect'
    ? { redirectTo: result.redirect.headers.get('Location') }
    : { status: result?.status }
}

// An unknown search value redirects to the URL without it, so the page renders the default and its
// canonical link never carries a value the gallery ignores.
describe('home search values the gallery does not know', () => {
  it.each([
    ['/?kind=foo', '/'],
    ['/?kind=', '/'],
    ['/?kind=statuslines', '/'],
    ['/?kind=foo&sort=new', '/?sort=new'],
    ['/?sort=foo', '/'],
  ])('redirects %s to %s', async (href, clean) => {
    expect(await loadHome(href)).toEqual({ redirectTo: clean })
  })

  it('renders a known kind filter where it is', async () => {
    expect(await loadHome('/?kind=mods')).toEqual({ status: 200 })
  })
})
