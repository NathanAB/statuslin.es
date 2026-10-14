// @vitest-environment node
import { createMemoryHistory } from '@tanstack/react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DESKTOP_GUIDE_DESCRIPTION, DESKTOP_GUIDE_TITLE_BASE } from '@/lib/page-title'
import { STATUSLINE_ANYWHERE_MOD_SLUG } from '@/lib/statusline-anywhere'
import type { ModDesktopShot } from '@/mods/desktop-shot'
import { Route as DesktopGuideRoute } from '@/routes/guide_.claude-desktop'

vi.mock('@/lib/analytics-config', () => ({
  getAnalyticsToken: vi.fn().mockResolvedValue(null),
}))
vi.mock('@/lib/auth-functions', () => ({
  getSession: vi.fn().mockResolvedValue(null),
}))
const getModDesktopShotFn = vi.hoisted(() => vi.fn())
vi.mock('@/mods/functions', () => ({ getModDesktopShotFn }))

const { getRouter } = await import('@/router')

const ORIGINAL = process.env.BETTER_AUTH_URL
afterEach(() => {
  process.env.BETTER_AUTH_URL = ORIGINAL
  getModDesktopShotFn.mockReset()
})

const SHOT = { src: '/mod-previews/v1/desktop.png?v=1', width: 800, height: 500 }

async function loadStatuslineAnywhere(state: ModDesktopShot) {
  getModDesktopShotFn.mockResolvedValue(state)
  const loader = DesktopGuideRoute.options.loader as (ctx: unknown) => Promise<{
    statuslineAnywhere: unknown
  }>
  const data = await loader({})
  return data.statuslineAnywhere
}

describe('/guide/claude-desktop page', () => {
  it('loads through the real router as its own page', async () => {
    getModDesktopShotFn.mockResolvedValue({ kind: 'unpublished' })
    const router = getRouter()
    router.update({
      history: createMemoryHistory({ initialEntries: ['/guide/claude-desktop'] }),
    })

    await router.load()

    expect(router.stores.redirect.get()).toBeFalsy()
    expect(router.state.matches.at(-1)?.routeId).toBe('/guide_/claude-desktop')
  })

  it('loads whether statusline-anywhere is published, and its Desktop screenshot', async () => {
    for (const state of [
      { kind: 'shot', shot: SHOT },
      { kind: 'no-shot' },
      { kind: 'unpublished' },
    ] as const) {
      expect(await loadStatuslineAnywhere(state)).toEqual(state)
    }
    expect(getModDesktopShotFn).toHaveBeenCalledWith({
      data: { slug: STATUSLINE_ANYWHERE_MOD_SLUG },
    })
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
