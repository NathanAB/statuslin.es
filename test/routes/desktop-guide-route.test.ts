// @vitest-environment node
import { createMemoryHistory } from '@tanstack/react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DESKTOP_GUIDE_DESCRIPTION, DESKTOP_GUIDE_TITLE_BASE } from '@/lib/page-title'
import { Route as DesktopGuideRoute } from '@/routes/guide_.claude-desktop'

vi.mock('@/lib/analytics-config', () => ({
  getAnalyticsToken: vi.fn().mockResolvedValue(null),
}))
vi.mock('@/lib/auth-functions', () => ({
  getSession: vi.fn().mockResolvedValue(null),
}))

const { getRouter } = await import('@/router')

const ORIGINAL = process.env.BETTER_AUTH_URL
afterEach(() => {
  process.env.BETTER_AUTH_URL = ORIGINAL
})

describe('/guide/claude-desktop page', () => {
  it('loads through the real router as its own page', async () => {
    const router = getRouter()
    router.update({
      history: createMemoryHistory({ initialEntries: ['/guide/claude-desktop'] }),
    })

    await router.load()

    expect(router.stores.redirect.get()).toBeFalsy()
    expect(router.state.matches.at(-1)?.routeId).toBe('/guide_/claude-desktop')
  })

  it('emits unique title, description, canonical, and social meta', async () => {
    process.env.BETTER_AUTH_URL = 'https://statuslin.es'
    const head = await DesktopGuideRoute.options.head?.({} as never)

    expect(head?.meta).toEqual(
      expect.arrayContaining([
        { title: `${DESKTOP_GUIDE_TITLE_BASE} | statuslin.es` },
        { name: 'description', content: DESKTOP_GUIDE_DESCRIPTION },
        { property: 'og:url', content: 'https://statuslin.es/guide/claude-desktop' },
        { property: 'og:title', content: DESKTOP_GUIDE_TITLE_BASE },
        { property: 'og:description', content: DESKTOP_GUIDE_DESCRIPTION },
      ]),
    )
    expect(head?.links).toContainEqual({
      rel: 'canonical',
      href: 'https://statuslin.es/guide/claude-desktop',
    })
  })

  it('emits TechArticle and a breadcrumb through the main guide', async () => {
    process.env.BETTER_AUTH_URL = 'https://statuslin.es'
    const head = await DesktopGuideRoute.options.head?.({} as never)
    const nodes = ((head?.scripts ?? []) as Array<{ children: string }>).map(
      (script) => JSON.parse(script.children) as Record<string, unknown>,
    )

    expect(nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          '@type': 'TechArticle',
          headline: DESKTOP_GUIDE_TITLE_BASE,
          url: 'https://statuslin.es/guide/claude-desktop',
          description: DESKTOP_GUIDE_DESCRIPTION,
        }),
      ]),
    )
    const crumbs = nodes.find((node) => node['@type'] === 'BreadcrumbList') as {
      itemListElement: Array<{ item: string }>
    }
    expect(crumbs.itemListElement.map((c) => c.item)).toEqual([
      'https://statuslin.es',
      'https://statuslin.es/guide',
      'https://statuslin.es/guide/claude-desktop',
    ])
  })
})
