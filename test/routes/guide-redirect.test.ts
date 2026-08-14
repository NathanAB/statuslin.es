// @vitest-environment node
import { createMemoryHistory } from '@tanstack/react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GUIDE_DESCRIPTION, GUIDE_TITLE_BASE } from '@/lib/page-title'
import { Route as GuideRoute } from '@/routes/guide'

vi.mock('@/lib/analytics-config', () => ({
  getAnalyticsToken: vi.fn().mockResolvedValue(null),
}))
vi.mock('@/lib/auth-functions', () => ({
  getSession: vi.fn().mockResolvedValue(null),
}))
vi.mock('@/guide/functions', () => ({
  getGuideHighlights: vi.fn().mockResolvedValue({
    payloadHtml: '<pre></pre>',
    scriptHtml: '<pre></pre>',
    settingsHtml: '<pre></pre>',
  }),
}))

const { getRouter } = await import('@/router')

const ORIGINAL = process.env.BETTER_AUTH_URL
afterEach(() => {
  process.env.BETTER_AUTH_URL = ORIGINAL
})

describe('/guide page', () => {
  it('loads through the real router as a self-canonical 200, not a redirect', async () => {
    const router = getRouter()
    router.update({
      history: createMemoryHistory({ initialEntries: ['/guide'] }),
    })

    await router.load()

    expect(router.stores.statusCode.get()).not.toBe(301)
    expect(router.stores.redirect.get()).toBeFalsy()
    expect(router.state.location.pathname).toBe('/guide')
  })

  it('emits unique title, description, canonical, and social meta', async () => {
    process.env.BETTER_AUTH_URL = 'https://statuslin.es'
    const head = await GuideRoute.options.head?.({} as never)

    expect(head?.meta).toEqual(
      expect.arrayContaining([
        { title: `${GUIDE_TITLE_BASE} | statuslin.es` },
        { name: 'description', content: GUIDE_DESCRIPTION },
        { property: 'og:url', content: 'https://statuslin.es/guide' },
        { property: 'og:title', content: GUIDE_TITLE_BASE },
        { property: 'og:description', content: GUIDE_DESCRIPTION },
      ]),
    )
    expect(head?.links).toContainEqual({
      rel: 'canonical',
      href: 'https://statuslin.es/guide',
    })
  })

  it('emits TechArticle and BreadcrumbList JSON-LD, never HowTo', async () => {
    process.env.BETTER_AUTH_URL = 'https://statuslin.es'
    const head = await GuideRoute.options.head?.({} as never)
    const nodes = ((head?.scripts ?? []) as Array<{ children: string }>).map(
      (script) => JSON.parse(script.children) as Record<string, unknown>,
    )

    expect(nodes.some((node) => node['@type'] === 'HowTo')).toBe(false)
    expect(nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          '@type': 'TechArticle',
          headline: GUIDE_TITLE_BASE,
          url: 'https://statuslin.es/guide',
          description: GUIDE_DESCRIPTION,
        }),
        expect.objectContaining({
          '@type': 'BreadcrumbList',
        }),
      ]),
    )
  })
})
