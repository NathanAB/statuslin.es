// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ModDetail } from '@/mods/queries'
import type { PublishedTheme } from '@/themes/queries'

vi.mock('@/mods/functions', () => ({ recordModCopyFn: vi.fn(), getModDetailFn: vi.fn() }))
vi.mock('sonner', () => ({ toast: vi.fn() }))
vi.mock('@posthog/react', () => ({ usePostHog: () => ({ capture: vi.fn() }) }))
vi.mock('@/ui/shell', () => ({
  PageShell: ({ children }: { children: ReactNode }) => <>{children}</>,
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

const { Route: ModRoute } = await import('@/routes/mods.$slug')

const PACK: ModDetail = {
  id: '11111111-1111-4111-8111-111111111111',
  slug: 'pack',
  pluginName: 'pack',
  title: 'Theme pack',
  description: 'Two terminal themes.',
  authorGithub: 'octocat',
  repoUrl: 'https://github.com/octocat/pack',
  path: '',
  commitSha: 'a'.repeat(40),
  license: 'MIT',
  footprint: { events: [], calls: [] },
  preview: [],
  desktop: { kind: 'nothing' },
  generatedContent: null,
  copyCount: 0,
  tags: [],
  updatedAt: '2026-11-20',
  recordedWith: '2.1.310',
  reviewedAt: null,
  themeOnly: true,
}

const theme = (name: string): PublishedTheme => ({
  id: name,
  kind: 'terminal',
  name,
  window: 'dark',
  preview: [{ text: `${name} screen` }],
  plugin: { id: PACK.id, slug: 'pack', title: 'Theme pack', authorGithub: 'octocat', code: null },
})

function renderPage(mod: Partial<ModDetail>, themes: PublishedTheme[]) {
  vi.spyOn(ModRoute, 'useLoaderData').mockReturnValue({
    mod: { ...PACK, related: [], themes, ...mod },
    user: null,
    origin: 'https://statuslin.es',
  })
  const Page = ModRoute.options.component
  return render(Page ? <Page /> : null)
}

const section = (title: string) =>
  screen.getByRole('heading', { level: 2, name: title }).closest('section') as HTMLElement

afterEach(() => {
  vi.restoreAllMocks()
})

describe('a plugin page with themes', () => {
  it("lists a theme-only plugin's themes in place of a mod preview that would show nothing", () => {
    renderPage({}, [theme('Dawn'), theme('Night')])

    const themes = within(section('Themes'))
    expect(themes.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      'Dawn',
      'Night',
    ])
    expect(themes.getByRole('img', { name: 'Night preview' }).textContent).toBe('Night screen')
    expect(themes.getAllByText('/theme')).toHaveLength(2)
    expect(screen.queryByRole('heading', { level: 2, name: 'Preview' })).toBeNull()
    expect(screen.queryByText(/Draws nothing/)).toBeNull()
  })

  // A plugin page is where a theme card leads, so its themes section leads on to every other theme.
  it('links its themes section to /themes', () => {
    renderPage({}, [theme('Night')])

    const link = within(section('Themes')).getByRole('link', {
      name: 'every Claude Code and Claude Desktop theme',
    })
    expect(link.getAttribute('href')).toBe('/themes')
  })

  it('keeps the mod preview of a plugin with code beside its themes', () => {
    renderPage(
      {
        themeOnly: false,
        footprint: { events: ['ui.render{component=Band}'], calls: [] },
        preview: [{ text: 'band row' }],
      },
      [theme('Night')],
    )

    expect(within(section('Preview')).getByText('band row')).toBeTruthy()
    expect(within(section('Themes')).getByRole('heading', { level: 3, name: 'Night' })).toBeTruthy()
  })

  it("links each Desktop theme's image to its whole window at full size", () => {
    const reef: PublishedTheme = {
      id: 'reef',
      kind: 'desktop',
      name: 'Night Reef',
      window: 'dark',
      preview: {
        shot: { src: '/theme-previews/reef/desktop.png?r=1', width: 1100, height: 900 },
        card: { src: '/theme-previews/reef/desktop.png?r=1&image=card', width: 440, height: 360 },
      },
      switchSteps: ['/custom-theme night-reef'],
      plugin: {
        id: PACK.id,
        slug: 'pack',
        title: 'Theme pack',
        authorGithub: 'octocat',
        code: null,
      },
    }
    renderPage({ themeOnly: false, preview: [{ text: 'band row' }] }, [reef])

    const themes = within(section('Themes'))
    const link = themes.getByRole('link', { name: /Night Reef preview/ })
    expect(link.getAttribute('href')).toBe('/theme-previews/reef/desktop.png?r=1')
    expect(within(link).getByRole('img', { name: 'Night Reef preview' }).getAttribute('src')).toBe(
      '/theme-previews/reef/desktop.png?r=1&image=card',
    )
  })

  it('shows no themes section for a mod without themes', () => {
    renderPage({ themeOnly: false, preview: [{ text: 'band row' }] }, [])

    expect(screen.queryByRole('heading', { level: 2, name: 'Themes' })).toBeNull()
    expect(section('Preview')).toBeTruthy()
  })
})
