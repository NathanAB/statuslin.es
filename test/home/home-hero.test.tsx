// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'
import type { HeroLine } from '@/gallery/hero-lines'
import type { HeroItem } from '@/home/showcase'
import type { HeroMod } from '@/mods/gallery-queries'

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    params,
    children,
  }: {
    to: string
    params?: Record<string, string>
    children: React.ReactNode
  }) => <a href={params ? to.replace(/\$(\w+)/g, (_, k) => params[k] ?? '') : to}>{children}</a>,
}))

// The button fetches and copies for real (test/adopt/install-prompt-button.test.tsx); here it
// only shows which status line it would install, and copies on click.
vi.mock('@/adopt/install-prompt-button', () => ({
  InstallPromptButton: ({ title, onCopied }: { title: string; onCopied: () => void }) => (
    <button type="button" onClick={onCopied}>
      Install {title}
    </button>
  ),
}))
const recordCopyFn = vi.hoisted(() => vi.fn().mockResolvedValue(0))
vi.mock('@/adopt/functions', () => ({ recordCopyFn }))
const recordModCopyFn = vi.hoisted(() => vi.fn().mockResolvedValue(0))
vi.mock('@/mods/functions', () => ({ recordModCopyFn }))
vi.mock('@posthog/react', () => ({
  usePostHog: () => ({ get_distinct_id: () => 'did', get_session_id: () => 'sid' }),
}))

const { HomeHero } = await import('@/home/home-hero')
const { modInstallPrompt } = await import('@/mods/install')

const writeText = vi.fn<(text: string) => Promise<void>>()
beforeEach(() => {
  writeText.mockReset().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
    writable: true,
  })
})

const line = (slug: string, title: string, copyCount: number, render: string): HeroLine => ({
  configId: `id-${slug}`,
  slug,
  title,
  copyCount,
  author: { name: slug, username: `${slug}-dev`, image: null },
  networkHosts: [],
  readsClaudeToken: false,
  render: [{ text: `${render} clean` }],
  desktop: null,
  sortKey: copyCount,
})

const mod = (slug: string, title: string, copyCount: number, extra: Partial<HeroMod> = {}) =>
  ({
    kind: 'mod',
    mod: {
      modId: `mod-${slug}`,
      slug,
      title,
      authorGithub: `${slug}-dev`,
      copyCount,
      render: [{ text: `${slug} band` }],
      desktop: null,
      footprint: { events: ['ui.render{component=AbovePrompt}', '$.http.fetch'], calls: [] },
      sortKey: copyCount,
      ...extra,
    },
  }) satisfies HeroItem

const SHOT = { src: '/panel-desktop.png', width: 784, height: 86 }

const ITEMS: HeroItem[] = [
  {
    kind: 'status-line',
    line: { ...line('panel', 'Dreambase Panel', 223, 'panel'), desktop: SHOT },
  },
  // Deck writes in Desktop's toolbar, so its card already shows the prompt box under its band.
  mod('deck', 'Deck', 120, {
    desktop: { src: '/deck-card.png', width: 784, height: 81 },
    footprint: {
      events: [
        'ui.render{component=AbovePrompt}',
        'ui.render{component=SessionMode}',
        '$.http.fetch',
      ],
      calls: [],
    },
  }),
  {
    kind: 'status-line',
    line: {
      ...line('pace', 'Pace Dot Meters', 94, 'pace'),
      readsClaudeToken: true,
      networkHosts: ['wttr.in'],
    },
  },
  mod('hint', 'Cost Hint', 5, {
    render: [{ text: 'hint under' }],
    footprint: { events: ['ui.render{component=PromptHint}'], calls: [] },
  }),
  { kind: 'status-line', line: line('kanji', 'Kanji Rain', 1, 'kanji') },
]

const heading = 'Claude Code mods'
const renderHero = () => render(<HomeHero heading={heading} items={ITEMS} />)
const picker = () => screen.getByRole('radiogroup', { name: 'Pick a mod' })
const pick = (name: RegExp) => fireEvent.click(within(picker()).getByRole('radio', { name }))
const views = () => screen.getByRole('radiogroup', { name: 'Show it in' })
const showIn = (name: 'Terminal' | 'Claude Desktop') =>
  fireEvent.click(within(views()).getByRole('radio', { name }))
const statusRow = () => document.querySelector('[data-slot="terminal-status"]') as HTMLElement
const band = () => document.querySelector('[data-slot="terminal-band"]')
const announced = () => screen.getByRole('status').textContent
/** The line under the install button that credits the shown item's author. */
const byline = () => screen.getByText('by').parentElement?.parentElement as HTMLElement
const reach = (title: string) =>
  [...document.querySelectorAll('p')].find((p) => p.textContent?.startsWith(`${title} `))
    ?.textContent

describe('HomeHero', () => {
  // You could copy a line that reads your Claude sign-in token without being told: the picked
  // line's reach and the site's review sit right under the install button. The sentence names the
  // line, so it plainly changes with the pick (a bare "No network access" read like an error).
  it('says what the picked line can reach, by name, and that everything is reviewed', () => {
    renderHero()

    expect(reach('Dreambase Panel')).toBe("Dreambase Panel doesn't connect to the internet.")
    expect(
      screen.getByText("Every mod here is reviewed and rendered in a sandbox before it's listed."),
    ).toBeTruthy()
    pick(/^Pace Dot Meters/)
    expect(reach('Pace Dot Meters')).toBe(
      'Pace Dot Meters reads your Claude sign-in token and connects to wttr.in.',
    )
  })

  it("server-renders the heading, the sentence and the first item's terminal", () => {
    const html = renderToString(<HomeHero heading={heading} items={ITEMS} />)

    expect(html).toContain(`<h1`)
    expect(html).toContain(heading)
    expect(html).toContain(
      'Track your usage limits, context window, git branch and more. Pick a mod and see it in action.',
    )
    expect(html).not.toMatch(/row under your prompt/)
    expect(html).toContain('panel clean')
    expect(html).toContain('Fix the flaky date test in utils')
  })

  // Status lines are one kind of mod: the hero lists both, as the gallery ranks them.
  it('lists status lines and mods as one radio group, each with its kind and installs', () => {
    renderHero()

    const radios = within(picker()).getAllByRole('radio')
    expect(radios.map((r) => r.textContent)).toEqual([
      'Dreambase PanelStatus line · 223 installs',
      'DeckMod · 120 installs',
      'Pace Dot MetersStatus line · 94 installs',
      'Cost HintMod · 5 installs',
      'Kanji RainStatus line · 1 install',
    ])
    expect(radios.map((r) => r.getAttribute('aria-checked'))).toEqual([
      'true',
      'false',
      'false',
      'false',
      'false',
    ])
  })

  it('renders the picked status line under the prompt, and says what it shows', () => {
    renderHero()

    pick(/^Pace Dot Meters/)

    expect(statusRow().textContent).toBe('pace clean')
    expect(band()).toBeNull()
    expect(announced()).toBe('Showing Pace Dot Meters under the prompt.')
    expect(
      screen.getByRole('link', { name: 'Open page: Pace Dot Meters' }).getAttribute('href'),
    ).toBe('/c/pace')
    expect(screen.getByRole('button', { name: 'Install Pace Dot Meters' })).toBeTruthy()
    expect(screen.getByRole('link', { name: '@pace-dev' }).getAttribute('href')).toBe(
      'https://github.com/pace-dev',
    )
    expect(byline().textContent).toContain('94 installs')
  })

  // A mod draws where its footprint says: Deck's band sits above the prompt, as in Claude Code.
  it('draws a picked mod where it draws in Claude Code, and installs it from its own prompt', async () => {
    renderHero()

    pick(/^Deck/)

    expect(band()?.textContent).toBe('deck band')
    expect(statusRow().textContent).toBe('')
    expect(
      screen.getByRole('img', { name: /^Claude Code with Deck above the prompt/ }),
    ).toBeTruthy()
    expect(announced()).toBe('Showing Deck above the prompt.')
    expect(screen.getByRole('link', { name: 'Open page: Deck' }).getAttribute('href')).toBe(
      '/mods/deck',
    )
    expect(screen.getByRole('link', { name: '@deck-dev' }).getAttribute('href')).toBe(
      'https://github.com/deck-dev',
    )
    expect(reach('Deck')).toBe('Deck connects to the internet.')

    fireEvent.click(screen.getByRole('button', { name: 'Copy install prompt for Deck' }))
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(modInstallPrompt(window.location.origin, 'deck')),
    )
    expect(recordModCopyFn).toHaveBeenCalled()
    await waitFor(() => expect(byline().textContent).toContain('121 installs'))
  })

  it('draws a mod that hints under the prompt in the status line row', () => {
    renderHero()

    pick(/^Cost Hint/)

    expect(statusRow().textContent).toBe('hint under')
    expect(band()).toBeNull()
  })

  // Mods and Desktop shots are recorded in one session, so the hero shows that one and offers no
  // session to pick: switching it would change nothing for most of the list.
  it('names where it shows the pick, with icons, and offers no session to pick', () => {
    renderHero()

    expect(
      within(views())
        .getAllByRole('radio')
        .map((r) => r.textContent),
    ).toEqual(['Terminal', 'Claude Desktop'])
    expect(screen.getByText('Show it in')).toBeTruthy()
    for (const radio of within(views()).getAllByRole('radio'))
      expect(radio.querySelector('svg'), radio.textContent ?? '').not.toBeNull()
    expect(screen.getAllByRole('radiogroup')).toHaveLength(2)
    expect(screen.queryByText(/session/i)).toBeNull()
  })

  // The same pick, shown as Claude Desktop's Code tab draws it.
  it('switches to Claude Desktop, showing the shot above its prompt box', () => {
    renderHero()

    showIn('Claude Desktop')

    // The screen is one picture, named for what it shows; the shot inside it is that picture.
    const shotIn = (name: string) =>
      screen.getByRole('img', { name }).querySelector('img')?.getAttribute('src')
    expect(shotIn('Dreambase Panel in Claude Desktop')).toBe(SHOT.src)
    // A status line shows in Desktop only through statusline-anywhere, so the frame says so.
    const viaAnywhere = () =>
      screen.queryByText('Status lines show here through statusline-anywhere.')
    expect(viaAnywhere()).toBeTruthy()
    // A status line's shot is only its strip, so the Code tab's prompt box is drawn under it.
    const promptBox = () => screen.queryByText('Type / for commands')
    expect(promptBox()).toBeTruthy()
    expect(statusRow()).toBeNull()
    expect(announced()).toBe('Showing Dreambase Panel in Claude Desktop.')

    pick(/^Deck/)
    expect(shotIn('Deck in Claude Desktop')).toBe('/deck-card.png')
    expect(viaAnywhere()).toBeNull()
    // Deck writes in the toolbar, so its card already shows Desktop's own prompt box.
    expect(promptBox()).toBeNull()
    // A mod that doesn't gets the prompt box drawn under its card, as a status line does.
    pick(/^Cost Hint/)
    expect(promptBox()).toBeTruthy()

    pick(/^Kanji Rain/)
    expect(screen.getByText('No Claude Desktop preview yet.')).toBeTruthy()

    showIn('Terminal')
    expect(statusRow().textContent).toBe('kanji clean')
    expect(viaAnywhere()).toBeNull()
  })

  // A long title used to push the link under the button: its visible words now never change.
  it("keeps the page link's visible words the same whatever is picked", () => {
    renderHero()
    const visible = () => {
      const link = screen.getByRole('link', { name: /^Open page: / }).cloneNode(true) as Element
      for (const hidden of link.querySelectorAll('.sr-only')) hidden.remove()
      return link.textContent
    }

    expect(visible()).toBe('Open page')
    pick(/^Kanji Rain/)
    expect(visible()).toBe('Open page')
    pick(/^Deck/)
    expect(visible()).toBe('Open page')
  })

  it('says so when a status line has no render yet', () => {
    render(
      <HomeHero
        heading={heading}
        items={[
          { kind: 'status-line', line: { ...line('new', 'New Line', 0, 'new'), render: null } },
        ]}
      />,
    )

    expect(statusRow().textContent).toBe('No render yet.')
  })

  it('moves through the list with the arrow keys', async () => {
    renderHero()
    const first = within(picker()).getByRole('radio', { name: /^Dreambase Panel/ })
    first.focus()

    fireEvent.keyDown(first, { key: 'ArrowDown' })

    // The roving focus moves on the next tick, and a radio picks what it lands on.
    await waitFor(() => expect(band()?.textContent).toBe('deck band'))
  })

  it('announces nothing until the visitor changes something', () => {
    renderHero()
    expect(announced()).toBe('')
  })

  // A new pick leaves the conversation in place; only switching app redraws it.
  it('keeps the conversation in place when only the pick changes', () => {
    renderHero()
    const before = document.querySelector('pre')

    pick(/^Pace Dot Meters/)

    expect(document.querySelector('pre')).toBe(before)
  })

  it('bumps the shown copy count when the visitor copies the prompt', () => {
    renderHero()

    fireEvent.click(screen.getByRole('button', { name: 'Install Dreambase Panel' }))

    expect(byline().textContent).toContain('224 installs')
    expect(within(picker()).getByRole('radio', { name: /^Dreambase Panel/ }).textContent).toBe(
      'Dreambase PanelStatus line · 224 installs',
    )
  })

  it('still names the page when nothing is published yet', () => {
    render(<HomeHero heading={heading} items={[]} />)

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(heading)
    expect(screen.queryByRole('radiogroup')).toBeNull()
  })

  it('has no axe violations, in the terminal or in Claude Desktop', async () => {
    const { container } = renderHero()
    expect(await axe(container)).toHaveNoViolations()
    showIn('Claude Desktop')
    expect(await axe(container)).toHaveNoViolations()
  })
})
