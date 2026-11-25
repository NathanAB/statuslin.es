// @vitest-environment jsdom
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PublishedTheme } from '@/themes/queries'

const recordModCopyFn = vi.hoisted(() => vi.fn())
vi.mock('@/mods/functions', () => ({ recordModCopyFn }))
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

const { Route: ThemesRoute } = await import('@/routes/themes')

const ORIGIN = 'https://statuslin.es'
const HOSTILE = '<img src=x onerror=alert(1)>'

type TerminalCard = Extract<PublishedTheme, { kind: 'terminal' }>
type DesktopCard = Extract<PublishedTheme, { kind: 'desktop' }>

function theme(name: string, slug: string, over: Partial<TerminalCard> = {}): TerminalCard {
  return {
    id: `${slug}-${name}`,
    key: `${slug}-${name}`,
    kind: 'terminal',
    name,
    window: 'dark',
    preview: [{ text: `${name} screen` }],
    usesTerminalColors: false,
    plugin: { id: `${slug}-id`, slug, title: `${slug} title`, authorGithub: 'octocat', code: null },
    ...over,
  }
}

function desktopTheme(name: string, over: Partial<DesktopCard> = {}): DesktopCard {
  return {
    id: `desktop-${name}`,
    key: `desktop-${name}`,
    kind: 'desktop',
    name,
    window: 'dark',
    preview: {
      shot: { src: `/theme-previews/${name}/desktop.png?r=1`, width: 1100, height: 900 },
      card: { src: `/theme-previews/${name}/desktop.png?r=1&image=card`, width: 440, height: 360 },
    },
    switchSteps: [`/custom-theme ${name.toLowerCase().replace(/ /g, '-')}`],
    plugin: {
      id: 'theme-examples-id',
      slug: 'theme-examples',
      title: 'Theme examples',
      authorGithub: 'anthropics',
      code: null,
    },
    ...over,
  }
}

/** /themes at `url` in a real router, with its own search rules, showing these themes. */
async function renderPage(themes: PublishedTheme[], url = '/themes') {
  const rootRoute = createRootRoute()
  const themesRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/themes',
    validateSearch: ThemesRoute.options.validateSearch as (search: Record<string, unknown>) => {
      window?: string
      where?: string
    },
    loader: () => ({ themes, user: null, origin: ORIGIN }),
    component: function Themes() {
      const Page = ThemesRoute.options.component
      return Page ? <Page /> : null
    },
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([themesRoute]),
    history: createMemoryHistory({ initialEntries: [url] }),
  })
  const { container } = render(<RouterProvider router={router} />)
  await screen.findByRole('heading', { level: 1 })
  return { router, container }
}

type PageRouter = Awaited<ReturnType<typeof renderPage>>['router']

/** Clicks `element`, then resolves once the router has rendered the navigation it started. */
async function clickAndWait(router: PageRouter, element: HTMLElement) {
  const rendered = new Promise<void>((resolve) => {
    const unsubscribe = router.subscribe('onRendered', () => {
      unsubscribe()
      resolve()
    })
  })
  await act(async () => {
    fireEvent.click(element)
    await rendered
  })
}

const cardNames = () => screen.queryAllByRole('heading', { level: 3 }).map((h) => h.textContent)

const cardOf = (name: string) =>
  screen.getByRole('heading', { level: 3, name }).closest('[data-slot="card"]') as HTMLElement

afterEach(() => {
  vi.restoreAllMocks()
  recordModCopyFn.mockReset()
})

describe('/themes', () => {
  // Most themes listed are Desktop themes, and people search "Claude Desktop themes" too.
  it('heads the page with both Claude Code and Claude Desktop themes', async () => {
    await renderPage([theme('Night', 'pack')])

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'Claude Code and Claude Desktop themes',
    )
  })

  it('shows one card per theme, each with its own preview in its window', async () => {
    await renderPage([
      theme('Paper', 'pack', { window: 'light' }),
      theme('Night', 'pack'),
      theme('Ember', 'other'),
    ])

    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(3)
    const paper = within(cardOf('Paper'))
    expect(paper.getByRole('img', { name: 'Paper preview' }).textContent).toBe('Paper screen')
    expect(paper.getByText('Light')).toBeTruthy()
    expect(within(cardOf('Night')).getByText('Dark')).toBeTruthy()
  })

  it("names the plugin, links its page, credits its author and gives that plugin's install command", async () => {
    await renderPage([theme('Night', 'pack')])

    const card = within(cardOf('Night'))
    expect(card.getByRole('link', { name: 'pack title' }).getAttribute('href')).toBe('/mods/pack')
    expect(card.getByRole('link', { name: /@octocat/ }).getAttribute('href')).toBe(
      'https://github.com/octocat',
    )
    expect(
      card.getByText(
        `claude plugin marketplace add ${ORIGIN}/marketplace.json && claude plugin install pack@statuslines`,
      ),
    ).toBeTruthy()
  })

  // /themes sorts plugins by installs, so a copy here counts like one on the plugin's own page.
  it("counts a copy of a card's install command as an install of its plugin, from /themes", async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    recordModCopyFn.mockResolvedValue(1)
    await renderPage([theme('Night', 'pack'), theme('Ember', 'other')])

    fireEvent.click(
      within(cardOf('Ember')).getByRole('button', { name: 'Copy install command for other title' }),
    )

    await waitFor(() => expect(recordModCopyFn).toHaveBeenCalledTimes(1))
    expect(writeText).toHaveBeenCalledWith(
      `claude plugin marketplace add ${ORIGIN}/marketplace.json && claude plugin install other@statuslines`,
    )
    expect(recordModCopyFn).toHaveBeenCalledWith({
      data: {
        modId: 'other-id',
        kind: 'prompt',
        surface: 'themes',
        distinctId: 'did-test',
        sessionId: 'sid-test',
      },
    })
  })

  it("says on the card when a theme's plugin also runs code, with what it can reach and a link to its page", async () => {
    const footprint = { events: [], calls: ['$.http.fetch', '$.fs.write', '$.process.run'] }
    await renderPage([
      theme('Night', 'mixed', {
        plugin: {
          id: 'mixed-id',
          slug: 'mixed',
          title: 'Mixed',
          authorGithub: 'octocat',
          code: { footprint },
        },
      }),
      theme('Dawn', 'pack'),
    ])

    const night = within(cardOf('Night'))
    const notice = night.getByText('Also runs code.').closest('div') as HTMLElement
    expect(notice.textContent).toBe('Also runs code. Can run programs and write files, +1 more.')
    expect(
      night.getByRole('link', { name: 'See what it can do: Mixed' }).getAttribute('href'),
    ).toBe('/mods/mixed')
    // The install command stays on the card.
    expect(night.getByText(/claude plugin install mixed@statuslines/)).toBeTruthy()

    const dawn = within(cardOf('Dawn'))
    expect(dawn.queryByText(/runs code/)).toBeNull()
    expect(dawn.queryByText(/^Can /)).toBeNull()
    expect(dawn.queryByRole('link', { name: /See what it can do/ })).toBeNull()
  })

  it('still says a plugin runs code when nothing it can reach is recorded', async () => {
    const footprint = { events: [], calls: [] }
    await renderPage([
      theme('Night', 'silent', {
        plugin: {
          id: 'silent-id',
          slug: 'silent',
          title: 'Silent',
          authorGithub: 'octocat',
          code: { footprint },
        },
      }),
    ])

    const notice = screen.getByText('Also runs code.').closest('div') as HTMLElement
    expect(notice.textContent).toBe("Also runs code. What it can reach isn't recorded yet.")
  })

  // The name to pick is the one stored with the theme whose preview the card shows.
  it("says to pick the card's own theme in /theme", async () => {
    await renderPage([theme('Night', 'pack'), theme('Dawn', 'pack')])

    for (const name of ['Night', 'Dawn']) {
      const step = within(cardOf(name)).getByText('/theme').closest('p') as HTMLElement
      expect(step.textContent).toBe(`Start a new session, run /theme and pick ${name}.`)
    }
  })

  it("shows a Desktop theme's whole window at the card's width, loaded only as it scrolls into view", async () => {
    await renderPage([desktopTheme('Honu Lagoon', { window: 'light' })])

    const card = within(cardOf('Honu Lagoon'))
    const shot = card.getByRole('img', { name: 'Honu Lagoon preview' })
    expect(shot.getAttribute('src')).toBe('/theme-previews/Honu Lagoon/desktop.png?r=1&image=card')
    expect(shot.getAttribute('loading')).toBe('lazy')
    expect([shot.getAttribute('width'), shot.getAttribute('height')]).toEqual(['440', '360'])
    expect(card.getByText('Light')).toBeTruthy()
  })

  it('says on each card where its theme applies', async () => {
    await renderPage([desktopTheme('Night Reef'), theme('Dawn', 'pack')])

    expect(within(cardOf('Night Reef')).getByText('Claude Desktop')).toBeTruthy()
    expect(within(cardOf('Dawn')).getByText('Terminal')).toBeTruthy()
  })

  it("tells a visitor to send the Desktop theme's own switch steps, in order", async () => {
    await renderPage([
      desktopTheme('Night Reef'),
      desktopTheme('Koi Pond', { switchSteps: ['/custom-theme koi-pond', '/fireworks auto off'] }),
    ])

    const reef = within(cardOf('Night Reef')).getByText('/custom-theme night-reef').closest('p')
    expect(reef?.textContent).toBe(
      'In Claude Desktop, start a new session and send /custom-theme night-reef.',
    )
    const koi = within(cardOf('Koi Pond')).getByText('/custom-theme koi-pond').closest('p')
    expect(koi?.textContent).toBe(
      'In Claude Desktop, start a new session and send /custom-theme koi-pond, then /fireworks auto off.',
    )
  })

  it('says a Desktop theme with no switch steps comes on by itself', async () => {
    await renderPage([desktopTheme('Rainy Window', { switchSteps: [] })])

    expect(within(cardOf('Rainy Window')).getByText(/on its own/).textContent).toBe(
      'In Claude Desktop, start a new session: the plugin sets Rainy Window on its own.',
    )
  })

  it("shows an author's theme name as text, never as markup", async () => {
    const { container } = await renderPage([theme(HOSTILE, 'pack')])

    expect(screen.getByRole('heading', { level: 3, name: HOSTILE })).toBeTruthy()
    expect(container.querySelector('img[src="x"]')).toBeNull()
  })

  it('says so when no theme is published yet', async () => {
    await renderPage([])

    expect(screen.getByText('No themes yet.')).toBeTruthy()
  })
})

describe('/themes filters', () => {
  const PAPER = theme('Paper', 'pack', { window: 'light' })
  const NIGHT = theme('Night', 'pack')
  const DAWN = theme('Dawn', 'other', { window: 'light' })
  const windowChoices = () =>
    within(screen.getByRole('radiogroup', { name: 'Window' }))
      .getAllByRole('radio')
      .map((radio) => [radio.textContent, radio.getAttribute('aria-checked')])

  it('shows only the light themes once Light is picked, and keeps the pick in the URL', async () => {
    const { router } = await renderPage([PAPER, NIGHT, DAWN])
    expect(windowChoices()).toEqual([
      ['All', 'true'],
      ['Light', 'false'],
      ['Dark', 'false'],
    ])
    expect(screen.getByText('3 themes')).toBeTruthy()

    await clickAndWait(router, screen.getByRole('radio', { name: 'Light' }))

    expect(router.state.location.href).toBe('/themes?window=light')
    expect(cardNames()).toEqual(['Paper', 'Dawn'])
    expect(screen.getByText('2 of 3 themes')).toBeTruthy()
    expect(windowChoices()).toEqual([
      ['All', 'false'],
      ['Light', 'true'],
      ['Dark', 'false'],
    ])
  })

  it('opens on the window the URL names, and All shows every theme again', async () => {
    const { router } = await renderPage([PAPER, NIGHT, DAWN], '/themes?window=dark')
    expect(cardNames()).toEqual(['Night'])
    expect(screen.getByText('1 of 3 themes')).toBeTruthy()

    await clickAndWait(router, screen.getByRole('radio', { name: 'All' }))

    expect(router.state.location.href).toBe('/themes')
    expect(cardNames()).toEqual(['Paper', 'Night', 'Dawn'])
  })

  // A choice of one filters nothing. Terminal themes are the only kind listed today, so the choice of
  // where a theme applies waits for Desktop themes.
  it('offers no window choice when every theme is dark, and no choice of where a theme applies', async () => {
    await renderPage([NIGHT, theme('Ember', 'other')])

    expect(screen.queryByRole('radiogroup', { name: 'Window' })).toBeNull()
    expect(screen.queryByRole('radiogroup', { name: 'Where it applies' })).toBeNull()
    expect(cardNames()).toEqual(['Night', 'Ember'])
    expect(screen.getByText('2 themes')).toBeTruthy()
  })

  it('says when no theme matches the URL, with a way back to every theme', async () => {
    await renderPage([NIGHT], '/themes?window=light')

    expect(cardNames()).toEqual([])
    expect(screen.getByText('No themes match this filter.')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Show all themes' }).getAttribute('href')).toBe(
      '/themes',
    )
  })

  it('ignores a window it does not know and shows every theme', async () => {
    await renderPage([PAPER, NIGHT], '/themes?window=dim')

    expect(cardNames()).toEqual(['Paper', 'Night'])
  })
})

describe('/themes palettes and card links', () => {
  // A shared link opens the page at that card, and keeps working when its plugin is re-pinned.
  it("links each card's name to the card itself, by its plugin and key", async () => {
    const { container } = await renderPage([
      theme('Catppuccin Mocha', 'catppuccin', { key: 'catppuccin-mocha' }),
    ])

    const link = screen.getByRole('link', { name: 'Catppuccin Mocha' })
    expect(link.getAttribute('href')).toBe('#catppuccin-catppuccin-mocha')
    const target = container.querySelector('#catppuccin-catppuccin-mocha')
    expect(target?.contains(cardOf('Catppuccin Mocha'))).toBe(true)
  })

  it('links the page of each named palette it lists a theme of, and no palette without one', async () => {
    await renderPage([
      theme('Nord', 'nord'),
      desktopTheme('Tokyo Night'),
      theme('Catppuccin Latte', 'catppuccin'),
      theme('Ember', 'ember'),
    ])

    const palettes = within(screen.getByRole('navigation', { name: 'Themes by palette' }))
    expect(
      palettes.getAllByRole('link').map((link) => [link.textContent, link.getAttribute('href')]),
    ).toEqual([
      ['Catppuccin', '/themes/catppuccin'],
      ['Tokyo Night', '/themes/tokyo-night'],
      ['Nord', '/themes/nord'],
    ])
  })
})
