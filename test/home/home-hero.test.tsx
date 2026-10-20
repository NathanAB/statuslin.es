// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'
import type { HeroLine } from '@/gallery/hero-lines'

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
vi.mock('@posthog/react', () => ({
  usePostHog: () => ({ get_distinct_id: () => 'did', get_session_id: () => 'sid' }),
}))

const { HomeHero } = await import('@/home/home-hero')

const line = (slug: string, title: string, copyCount: number, render: string): HeroLine => ({
  configId: `id-${slug}`,
  slug,
  title,
  copyCount,
  author: { name: slug, username: `${slug}-dev`, image: null },
  networkHosts: [],
  readsClaudeToken: false,
  renders: {
    'clean-main': [{ text: `${render} clean` }],
    'fresh-session': [{ text: `${render} fresh` }],
    'dirty-feature': [{ text: `${render} dirty` }],
  },
})

const LINES = [
  line('panel', 'Dreambase Panel', 223, 'panel'),
  {
    ...line('pace', 'Pace Dot Meters', 94, 'pace'),
    readsClaudeToken: true,
    networkHosts: ['wttr.in'],
  },
  line('kanji', 'Kanji Rain', 1, 'kanji'),
]

const heading = 'Claude Code status lines and mods'
const renderHero = () => render(<HomeHero heading={heading} lines={LINES} />)
const picker = () => screen.getByRole('radiogroup', { name: 'Pick a status line' })
const sessions = () => screen.getByRole('radiogroup', { name: 'Session' })
const statusRow = () => document.querySelector('[data-slot="terminal-status"]') as HTMLElement
const announced = () => screen.getByRole('status').textContent

describe('HomeHero', () => {
  // You could copy a line that reads your Claude login without being told: the picked line's reach
  // and the site's review now sit right under the install button.
  it('says what the picked line can reach, and that a person read it, under the button', () => {
    renderHero()
    const facts = () => screen.getByRole('list', { name: 'What this status line can reach' })

    expect(facts().textContent).toBe('No network access')
    expect(
      screen.getByText('Every line here was read by a person and rendered in a sandbox.'),
    ).toBeTruthy()
    fireEvent.click(within(picker()).getByRole('radio', { name: /^Pace Dot Meters/ }))
    expect([...facts().querySelectorAll('li')].map((li) => li.textContent)).toEqual([
      'Reads your Claude login',
      'Calls wttr.in',
    ])
  })

  it("server-renders the heading, the sentence and the first status line's Everyday session", () => {
    const html = renderToString(<HomeHero heading={heading} lines={LINES} />)

    expect(html).toContain(`<h1`)
    expect(html).toContain(heading)
    expect(html).toContain(
      'A status line is the row under your Claude Code prompt. Pick one the community made and see how it looks in a session.',
    )
    expect(html).toContain('panel clean')
    expect(html).toContain('Fix the flaky date test in utils')
    expect(html).toContain('Opus 4.8 · clean main · 22% of context')
  })

  it('lists the status lines as one radio group, with their install counts', () => {
    renderHero()

    const radios = within(picker()).getAllByRole('radio')
    expect(radios.map((r) => r.textContent)).toEqual([
      'Dreambase Panel223 installs',
      'Pace Dot Meters94 installs',
      'Kanji Rain1 install',
    ])
    expect(radios.map((r) => r.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false'])
  })

  it('renders the picked status line under the prompt, and says what it shows', () => {
    renderHero()

    fireEvent.click(within(picker()).getByRole('radio', { name: /^Pace Dot Meters/ }))

    expect(statusRow().textContent).toBe('pace clean')
    expect(announced()).toBe('Showing Pace Dot Meters in the Everyday session.')
    expect(
      screen.getByRole('link', { name: 'Open page: Pace Dot Meters' }).getAttribute('href'),
    ).toBe('/c/pace')
    expect(screen.getByRole('button', { name: 'Install Pace Dot Meters' })).toBeTruthy()
    expect(screen.getByText('by @pace-dev · 94 installs')).toBeTruthy()
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
    fireEvent.click(within(picker()).getByRole('radio', { name: /^Kanji Rain/ }))
    expect(visible()).toBe('Open page')
  })

  it('switches the conversation, the caption and the data with the session', () => {
    renderHero()

    fireEvent.click(within(sessions()).getByRole('radio', { name: 'Uncommitted changes' }))

    expect(screen.getByText(/Add rate limiting to the login route/)).toBeTruthy()
    expect(screen.queryByText(/Fix the flaky date test in utils/)).toBeNull()
    expect(screen.getByText('Sonnet 4.6 · feat/auth · 48% of context')).toBeTruthy()
    expect(statusRow().textContent).toBe('panel dirty')
    expect(announced()).toBe('Showing Dreambase Panel in the Uncommitted changes session.')
  })

  it('says so when a status line has no render for the session', () => {
    renderHero()

    fireEvent.click(within(sessions()).getByRole('radio', { name: '1M context' }))

    expect(statusRow().textContent).toBe('No render for this session yet.')
  })

  it('moves through the status lines with the arrow keys', async () => {
    renderHero()
    const first = within(picker()).getByRole('radio', { name: /^Dreambase Panel/ })
    first.focus()

    fireEvent.keyDown(first, { key: 'ArrowDown' })

    // The roving focus moves on the next tick, and a radio picks what it lands on.
    await waitFor(() => expect(statusRow().textContent).toBe('pace clean'))
  })

  it('announces nothing until the visitor changes something', () => {
    renderHero()
    expect(announced()).toBe('')
  })

  // Only a new session replays the conversation's entrance; a new status line leaves it in place.
  it('keeps the conversation in place when only the status line changes', () => {
    renderHero()
    const before = document.querySelector('pre')

    fireEvent.click(within(picker()).getByRole('radio', { name: /^Pace Dot Meters/ }))

    expect(document.querySelector('pre')).toBe(before)
  })

  it('bumps the shown copy count when the visitor copies the prompt', () => {
    renderHero()

    fireEvent.click(screen.getByRole('button', { name: 'Install Dreambase Panel' }))

    expect(screen.getByText('by @panel-dev · 224 installs')).toBeTruthy()
    expect(within(picker()).getByRole('radio', { name: /^Dreambase Panel/ }).textContent).toBe(
      'Dreambase Panel224 installs',
    )
  })

  it('still names the page when nothing is published yet', () => {
    render(<HomeHero heading={heading} lines={[]} />)

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(heading)
    expect(screen.queryByRole('radiogroup')).toBeNull()
  })

  it('has no axe violations', async () => {
    const { container } = renderHero()
    expect(await axe(container)).toHaveNoViolations()
  })
})
