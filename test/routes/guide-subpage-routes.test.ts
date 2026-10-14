// @vitest-environment node
import { createMemoryHistory } from '@tanstack/react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MOD_SAFETY_FAQ } from '@/guide/mod-safety-faq'
import { STATUS_LINES_VS_MODS_FAQ } from '@/guide/status-lines-vs-mods-faq'
import {
  GUIDE_TITLE_BASE,
  MOD_SAFETY_GUIDE_DESCRIPTION,
  MOD_SAFETY_GUIDE_PATH,
  MOD_SAFETY_GUIDE_TITLE,
  STATUS_LINES_VS_MODS_GUIDE_DESCRIPTION,
  STATUS_LINES_VS_MODS_GUIDE_PATH,
  STATUS_LINES_VS_MODS_GUIDE_TITLE,
} from '@/lib/page-title'
import { Route as ModSafetyRoute } from '@/routes/guide_.are-claude-code-mods-safe'
import { Route as StatusLinesVsModsRoute } from '@/routes/guide_.status-lines-vs-mods'
import { serverResult } from './server-result'

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

const GUIDES = [
  {
    routeId: '/guide_/status-lines-vs-mods',
    path: STATUS_LINES_VS_MODS_GUIDE_PATH,
    title: STATUS_LINES_VS_MODS_GUIDE_TITLE,
    description: STATUS_LINES_VS_MODS_GUIDE_DESCRIPTION,
    faq: STATUS_LINES_VS_MODS_FAQ,
    route: StatusLinesVsModsRoute,
  },
  {
    routeId: '/guide_/are-claude-code-mods-safe',
    path: MOD_SAFETY_GUIDE_PATH,
    title: MOD_SAFETY_GUIDE_TITLE,
    description: MOD_SAFETY_GUIDE_DESCRIPTION,
    faq: MOD_SAFETY_FAQ,
    route: ModSafetyRoute,
  },
]

async function headOf(route: (typeof GUIDES)[number]['route']) {
  process.env.BETTER_AUTH_URL = 'https://statuslin.es'
  return route.options.head?.({} as never)
}

describe.each(GUIDES)('$path page', (guide) => {
  it('loads through the real router as its own page', async () => {
    const router = getRouter()
    router.update({ history: createMemoryHistory({ initialEntries: [guide.path] }) })

    await router.load()

    expect(serverResult(router)).toMatchObject({ type: 'render', status: 200 })
    expect(router.state.matches.at(-1)?.routeId).toBe(guide.routeId)
  })

  it('emits a short title, its description, canonical and social meta', async () => {
    const head = await headOf(guide.route)
    const url = `https://statuslin.es${guide.path}`

    expect(guide.title.length).toBeLessThanOrEqual(60)
    expect(guide.description.length).toBeLessThanOrEqual(160)
    expect(head?.meta).toEqual(
      expect.arrayContaining([
        { title: guide.title },
        { name: 'description', content: guide.description },
        { property: 'og:url', content: url },
        { property: 'og:title', content: guide.title },
        { property: 'og:description', content: guide.description },
      ]),
    )
    expect(head?.links).toContainEqual({ rel: 'canonical', href: url })
  })

  it('emits a TechArticle, a breadcrumb through /guide and its questions as a FAQPage', async () => {
    const head = await headOf(guide.route)
    const nodes = ((head?.scripts ?? []) as Array<{ children: string }>).map(
      (script) => JSON.parse(script.children) as Record<string, unknown>,
    )
    const ofType = (type: string) => nodes.find((node) => node['@type'] === type)

    expect(ofType('TechArticle')).toMatchObject({
      headline: guide.title,
      url: `https://statuslin.es${guide.path}`,
      description: guide.description,
    })
    const crumbs = ofType('BreadcrumbList') as { itemListElement: Array<{ name: string }> }
    expect(crumbs.itemListElement.map((crumb) => crumb.name)).toEqual([
      'Status lines',
      GUIDE_TITLE_BASE,
      guide.title,
    ])
    const faq = ofType('FAQPage') as { mainEntity: Array<{ name: string }> }
    expect(faq.mainEntity.map((question) => question.name)).toEqual(
      guide.faq.map((entry) => entry.question),
    )
  })
})
