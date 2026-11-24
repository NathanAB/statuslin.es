// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { findPalette } from '@/themes/palettes'
import type { PublishedTheme, UnreviewedTheme } from '@/themes/queries'

vi.mock('@/mods/functions', () => ({ recordModCopyFn: vi.fn() }))
vi.mock('@/lib/auth-functions', () => ({ getSession: async () => null }))
vi.mock('@posthog/react', () => ({
  usePostHog: () => ({ get_distinct_id: () => 'did-test', get_session_id: () => 'sid-test' }),
}))
vi.mock('@tanstack/react-router', async () => {
  const actual =
    await vi.importActual<typeof import('@tanstack/react-router')>('@tanstack/react-router')
  return {
    ...actual,
    Link: ({
      to,
      params,
      children,
    }: {
      to: string
      params?: Record<string, string>
      children: ReactNode
    }) => <a href={params ? to.replace(/\$(\w+)/g, (_, k) => params[k] ?? '') : to}>{children}</a>,
  }
})
vi.mock('@/ui/shell', () => ({
  PageShell: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

const { Route } = await import('@/routes/themes_.$palette')

const NORD = findPalette('nord')

const SNOW: PublishedTheme = {
  id: 't1',
  key: 'nord-snow',
  kind: 'terminal',
  name: 'Nord Snow',
  window: 'light',
  preview: [{ text: 'Snow screen' }],
  usesTerminalColors: false,
  plugin: { id: 'nordic-id', slug: 'nordic', title: 'Nordic', authorGithub: 'octocat', code: null },
}

const NIGHT: UnreviewedTheme = {
  id: 'u1',
  key: 'nord-night',
  kind: 'desktop',
  name: 'Nord Night',
  window: 'dark',
  preview: {
    shot: { src: '/theme-previews/u1/desktop.png?r=1', width: 1100, height: 900 },
    card: { src: '/theme-previews/u1/desktop.png?r=1&image=card', width: 440, height: 360 },
  },
  mod: { owner: 'Ada', pluginName: 'looks' },
}

function renderPage(unreviewed: UnreviewedTheme[]) {
  vi.spyOn(Route, 'useLoaderData').mockReturnValue({
    palette: NORD,
    themes: [SNOW],
    unreviewed,
    palettes: [NORD],
    user: null,
    origin: 'https://statuslin.es',
  })
  const Page = Route.options.component
  return render(Page ? <Page /> : null)
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('a palette page', () => {
  it("shows the palette's unreviewed themes in their own section below the reviewed ones", () => {
    renderPage([NIGHT])

    const names = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
    expect(names).toEqual(['Nord Snow', 'Nord Night'])
    const section = screen.getByRole('heading', { level: 2, name: 'Not reviewed' }).parentElement
      ?.parentElement as HTMLElement
    const card = within(section)
      .getByRole('heading', { level: 3, name: 'Nord Night' })
      .closest('[data-slot="card"]') as HTMLElement
    expect(within(card).getByRole('link', { name: 'looks' }).getAttribute('href')).toBe(
      '/mods/unreviewed/Ada/looks',
    )
    expect(card.textContent).not.toMatch(/install|custom-theme/i)
  })

  it('has no Not reviewed section without unreviewed themes', () => {
    renderPage([])

    expect(screen.queryByRole('heading', { name: 'Not reviewed' })).toBeNull()
  })
})
