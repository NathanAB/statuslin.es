import type { ReactNode } from 'react'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReviewTheme } from '@/review/theme-review'
import type { PublishedTheme } from '@/themes/queries'

vi.mock('@/mods/functions', () => ({ recordModCopyFn: vi.fn() }))
vi.mock('@posthog/react', () => ({
  usePostHog: () => ({ get_distinct_id: () => 'did-test', get_session_id: () => 'sid-test' }),
}))
vi.mock('@tanstack/react-router', async () => {
  const actual =
    await vi.importActual<typeof import('@tanstack/react-router')>('@tanstack/react-router')
  return {
    ...actual,
    Link: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a>,
    useNavigate: () => vi.fn(),
  }
})
vi.mock('@/ui/shell', () => ({
  PageShell: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

const { Route: ThemesRoute } = await import('@/routes/themes')
const { PluginThemes } = await import('@/themes/plugin-themes')
const { ThemeReviewList } = await import('@/review/theme-review-list')

const NOTICE = "Uses your terminal's own colors. This preview shows a default terminal's colors."
const text = (html: string) => html.replaceAll('&#x27;', "'")

type TerminalCard = Extract<PublishedTheme, { kind: 'terminal' }>
type TerminalReview = Extract<ReviewTheme, { kind: 'terminal' }>

function card(name: string, usesTerminalColors: boolean): TerminalCard {
  return {
    id: name,
    key: name,
    kind: 'terminal',
    name,
    window: 'light',
    preview: [{ text: `${name} screen` }],
    usesTerminalColors,
    plugin: { id: 'pack-id', slug: 'pack', title: 'Pack', authorGithub: 'octocat', code: null },
  }
}

function review(name: string, usesTerminalColors: boolean): TerminalReview {
  return {
    id: name,
    kind: 'terminal',
    key: name.toLowerCase(),
    name,
    window: 'light',
    source: '{ "base": "dark-ansi" }',
    preview: [{ text: `${name} screen` }],
    usesTerminalColors,
    change: null,
  }
}

function themesPageHtml(themes: PublishedTheme[]) {
  vi.spyOn(ThemesRoute, 'useLoaderData').mockReturnValue({
    themes,
    unreviewed: [],
    user: null,
    origin: 'https://statuslin.es',
  })
  vi.spyOn(ThemesRoute, 'useSearch').mockReturnValue({})
  const Page = ThemesRoute.options.component
  return text(renderToString(Page ? <Page /> : null))
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe("a terminal theme drawn with the terminal's own colors", () => {
  it('says so on its /themes card', () => {
    expect(themesPageHtml([card('Gruvbox Light (ANSI)', true)])).toContain(NOTICE)
  })

  it('says nothing of the kind on a card whose theme sets its own colors', () => {
    expect(themesPageHtml([card('Paper', false)])).not.toContain("terminal's own colors")
  })

  it("says so on its plugin page's card, and only there", () => {
    expect(text(renderToString(<PluginThemes themes={[card('Dawn (ANSI)', true)]} />))).toContain(
      NOTICE,
    )
    expect(text(renderToString(<PluginThemes themes={[card('Paper', false)]} />))).not.toContain(
      "terminal's own colors",
    )
  })

  it('tells the operator so in /admin', () => {
    expect(text(renderToString(<ThemeReviewList themes={[review('Dawn', true)]} />))).toContain(
      NOTICE,
    )
    expect(
      text(renderToString(<ThemeReviewList themes={[review('Paper', false)]} />)),
    ).not.toContain("terminal's own colors")
  })
})
