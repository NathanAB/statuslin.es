// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PublishedTheme } from '@/themes/queries'

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
    kind: 'terminal',
    name,
    window: 'dark',
    preview: [{ text: `${name} screen` }],
    plugin: { slug, title: `${slug} title`, authorGithub: 'octocat', code: null },
    ...over,
  }
}

function desktopTheme(name: string, over: Partial<DesktopCard> = {}): DesktopCard {
  return {
    id: `desktop-${name}`,
    kind: 'desktop',
    name,
    window: 'dark',
    preview: {
      shot: { src: `/theme-previews/${name}/desktop.png?r=1`, width: 1100, height: 900 },
      card: { src: `/theme-previews/${name}/desktop.png?r=1&image=card`, width: 440, height: 360 },
    },
    switchSteps: [`/custom-theme ${name.toLowerCase().replace(/ /g, '-')}`],
    plugin: {
      slug: 'theme-examples',
      title: 'Theme examples',
      authorGithub: 'anthropics',
      code: null,
    },
    ...over,
  }
}

function renderPage(themes: PublishedTheme[]) {
  vi.spyOn(ThemesRoute, 'useLoaderData').mockReturnValue({ themes, user: null, origin: ORIGIN })
  const Page = ThemesRoute.options.component
  return render(Page ? <Page /> : null)
}

const cardOf = (name: string) =>
  screen.getByRole('heading', { level: 3, name }).closest('[data-slot="card"]') as HTMLElement

afterEach(() => {
  vi.restoreAllMocks()
})

describe('/themes', () => {
  it('shows one card per theme, each with its own preview in its window', () => {
    renderPage([
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

  it("names the plugin, links its page, credits its author and gives that plugin's install command", () => {
    renderPage([theme('Night', 'pack')])

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

  it("says on the card when a theme's plugin also runs code, with what it can reach and a link to its page", () => {
    const footprint = { events: [], calls: ['$.http.fetch', '$.fs.write', '$.process.run'] }
    renderPage([
      theme('Night', 'mixed', {
        plugin: { slug: 'mixed', title: 'Mixed', authorGithub: 'octocat', code: { footprint } },
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

  it('still says a plugin runs code when nothing it can reach is recorded', () => {
    const footprint = { events: [], calls: [] }
    renderPage([
      theme('Night', 'silent', {
        plugin: { slug: 'silent', title: 'Silent', authorGithub: 'octocat', code: { footprint } },
      }),
    ])

    const notice = screen.getByText('Also runs code.').closest('div') as HTMLElement
    expect(notice.textContent).toBe("Also runs code. What it can reach isn't recorded yet.")
  })

  // The name to pick is the one stored with the theme whose preview the card shows.
  it("says to pick the card's own theme in /theme", () => {
    renderPage([theme('Night', 'pack'), theme('Dawn', 'pack')])

    for (const name of ['Night', 'Dawn']) {
      const step = within(cardOf(name)).getByText('/theme').closest('p') as HTMLElement
      expect(step.textContent).toBe(`Start a new session, run /theme and pick ${name}.`)
    }
  })

  it("shows a Desktop theme's whole window at the card's width, loaded only as it scrolls into view", () => {
    renderPage([desktopTheme('Honu Lagoon', { window: 'light' })])

    const card = within(cardOf('Honu Lagoon'))
    const shot = card.getByRole('img', { name: 'Honu Lagoon preview' })
    expect(shot.getAttribute('src')).toBe('/theme-previews/Honu Lagoon/desktop.png?r=1&image=card')
    expect(shot.getAttribute('loading')).toBe('lazy')
    expect([shot.getAttribute('width'), shot.getAttribute('height')]).toEqual(['440', '360'])
    expect(card.getByText('Light')).toBeTruthy()
  })

  it('says on each card where its theme applies', () => {
    renderPage([desktopTheme('Night Reef'), theme('Dawn', 'pack')])

    expect(within(cardOf('Night Reef')).getByText('Claude Desktop')).toBeTruthy()
    expect(within(cardOf('Dawn')).getByText('Terminal')).toBeTruthy()
  })

  it("tells a visitor to send the Desktop theme's own switch steps, in order", () => {
    renderPage([
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

  it('says a Desktop theme with no switch steps comes on by itself', () => {
    renderPage([desktopTheme('Rainy Window', { switchSteps: [] })])

    expect(within(cardOf('Rainy Window')).getByText(/on its own/).textContent).toBe(
      'In Claude Desktop, start a new session: the plugin sets Rainy Window on its own.',
    )
  })

  it("shows an author's theme name as text, never as markup", () => {
    const { container } = renderPage([theme(HOSTILE, 'pack')])

    expect(screen.getByRole('heading', { level: 3, name: HOSTILE })).toBeTruthy()
    expect(container.querySelector('img[src="x"]')).toBeNull()
  })

  it('says so when no theme is published yet', () => {
    renderPage([])

    expect(screen.getByText('No themes yet.')).toBeTruthy()
  })
})
