// @vitest-environment node
import { createMemoryHistory } from '@tanstack/react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BUDDY_FAQ } from '@/guide/buddy-faq'
import { MOD_SAFETY_FAQ } from '@/guide/mod-safety-faq'
import { NOT_SHOWING_FAQ } from '@/guide/status-line-not-showing-faq'
import { STATUS_LINES_VS_MODS_FAQ } from '@/guide/status-lines-vs-mods-faq'
import {
  BUDDY_GUIDE_DESCRIPTION,
  BUDDY_GUIDE_PATH,
  BUDDY_GUIDE_TITLE,
  MOD_SAFETY_GUIDE_DESCRIPTION,
  MOD_SAFETY_GUIDE_PATH,
  MOD_SAFETY_GUIDE_TITLE,
  NOT_SHOWING_GUIDE_DATES,
  NOT_SHOWING_GUIDE_DESCRIPTION,
  NOT_SHOWING_GUIDE_PATH,
  NOT_SHOWING_GUIDE_TITLE,
  STATUS_LINES_VS_MODS_GUIDE_DESCRIPTION,
  STATUS_LINES_VS_MODS_GUIDE_PATH,
  STATUS_LINES_VS_MODS_GUIDE_TITLE,
} from '@/lib/page-title'
import { STATUSLINE_ANYWHERE_MOD_SLUG } from '@/lib/statusline-anywhere'
import { Route as ModSafetyRoute } from '@/routes/guide_.are-claude-code-mods-safe'
import { Route as BuddyRoute } from '@/routes/guide_.claude-code-buddy'
import { Route as NotShowingRoute } from '@/routes/guide_.status-line-not-showing'
import { Route as StatusLinesVsModsRoute } from '@/routes/guide_.status-lines-vs-mods'
import { serverResult } from './server-result'

vi.mock('@/lib/analytics-config', () => ({
  getAnalyticsToken: vi.fn().mockResolvedValue(null),
}))
vi.mock('@/lib/auth-functions', () => ({
  getSession: vi.fn().mockResolvedValue(null),
}))
const getModDesktopShotFn = vi.hoisted(() => vi.fn().mockResolvedValue({ kind: 'unpublished' }))
vi.mock('@/mods/functions', () => ({ getModDesktopShotFn }))
const getBuddyPetsFn = vi.hoisted(() => vi.fn().mockResolvedValue({ cards: [], clashes: [] }))
vi.mock('@/guide/functions', () => ({ getBuddyPetsFn }))

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
  {
    routeId: '/guide_/status-line-not-showing',
    path: NOT_SHOWING_GUIDE_PATH,
    title: NOT_SHOWING_GUIDE_TITLE,
    description: NOT_SHOWING_GUIDE_DESCRIPTION,
    faq: NOT_SHOWING_FAQ,
    route: NotShowingRoute,
  },
  {
    routeId: '/guide_/claude-code-buddy',
    path: BUDDY_GUIDE_PATH,
    title: BUDDY_GUIDE_TITLE,
    description: BUDDY_GUIDE_DESCRIPTION,
    faq: BUDDY_FAQ,
    route: BuddyRoute,
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
      'statuslin.es',
      'Guide',
      guide.title,
    ])
    const faq = ofType('FAQPage') as { mainEntity: Array<{ name: string }> }
    expect(faq.mainEntity.map((question) => question.name)).toEqual(
      guide.faq.map((entry) => entry.question),
    )
  })
})

describe('/guide/status-line-not-showing page', () => {
  it('names the problem in a title Google shows whole, without the brand', () => {
    expect(NOT_SHOWING_GUIDE_TITLE).toBe('Claude Code Status Line Not Showing? How to Fix It')
    expect(NOT_SHOWING_GUIDE_TITLE.length).toBeLessThanOrEqual(60)
  })

  it('dates its TechArticle from its published and modified days', async () => {
    const head = await headOf(NotShowingRoute)
    const article = ((head?.scripts ?? []) as Array<{ children: string }>)
      .map((script) => JSON.parse(script.children) as Record<string, unknown>)
      .find((node) => node['@type'] === 'TechArticle')

    expect(NOT_SHOWING_GUIDE_DATES).toEqual({ published: '2026-10-18', modified: '2026-10-18' })
    expect(article).toMatchObject({
      datePublished: NOT_SHOWING_GUIDE_DATES.published,
      dateModified: NOT_SHOWING_GUIDE_DATES.modified,
    })
  })
})

describe('/guide/status-lines-vs-mods loader', () => {
  it('loads whether statusline-anywhere is published, through the narrow server function', async () => {
    getModDesktopShotFn.mockResolvedValueOnce({ kind: 'no-shot' })
    const loader = StatusLinesVsModsRoute.options.loader as (ctx: unknown) => Promise<{
      statuslineAnywhere: unknown
    }>

    expect((await loader({})).statuslineAnywhere).toEqual({ kind: 'no-shot' })
    expect(getModDesktopShotFn).toHaveBeenCalledWith({
      data: { slug: STATUSLINE_ANYWHERE_MOD_SLUG },
    })
  })
})

describe('/guide/claude-code-buddy loader', () => {
  it('loads the published pet cards and their clashes through the guide server function', async () => {
    const cards = [{ slug: 'pixipet' }]
    const clashes = [{ command: 'pet', titles: ['Pixipet', 'Code Pet'] }]
    getBuddyPetsFn.mockResolvedValueOnce({ cards, clashes })
    const loader = BuddyRoute.options.loader as (
      ctx: unknown,
    ) => Promise<{ cards: unknown; clashes: unknown }>

    expect(await loader({})).toMatchObject({ cards, clashes })
  })
})
