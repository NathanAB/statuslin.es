// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...props }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}))

const { CustomizeHero } = await import('@/resources/customize-hero')

const picker = () => screen.getByRole('radiogroup', { name: 'Pick what to customize' })

// /resources opens on a Claude Code session: pick a way to customize it and see where it lives.
describe('CustomizeHero', () => {
  it('titles the page and offers every way to customize Claude Code, mods first', () => {
    render(<CustomizeHero />)
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Claude Code customization tools & resources',
      }),
    ).toBeTruthy()
    expect(
      within(picker())
        .getAllByRole('radio')
        .map((r) => r.textContent),
    ).toEqual([
      'ModsPanes and bands',
      'Status lineUnder the prompt',
      'ThemesColors',
      'Spinner verbsThe spinner',
      'Output stylesReplies',
      'HooksTool calls',
      'SkillsOn demand',
      'SubagentsSide tasks',
    ])
    expect(within(picker()).getByRole('radio', { name: /Mods/ }).getAttribute('aria-checked')).toBe(
      'true',
    )
  })

  it('shows the pick on the screen, says what it changes, and links its docs and examples', () => {
    render(<CustomizeHero />)
    expect(
      screen.getByRole('img', {
        name: 'A Claude Code session with the band a mod draws above the prompt lit.',
      }),
    ).toBeTruthy()
    expect(screen.getByText(/Panes, a band above the prompt/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Browse mods' }).getAttribute('href')).toBe('/mods')
    const docs = screen.getByRole('link', { name: "Anthropic's docs on mods" })
    expect(docs.getAttribute('href')).toBe('https://code.claude.com/docs/en/plugins/mods/overview')
    expect(docs.getAttribute('target')).toBe('_blank')
  })

  it('moves the screen, the words and the links to a new pick', () => {
    render(<CustomizeHero />)
    fireEvent.click(within(picker()).getByRole('radio', { name: /Themes/ }))

    expect(
      screen.getByRole('img', { name: 'The same Claude Code session in a light theme.' }),
    ).toBeTruthy()
    expect(
      screen.getByRole('link', { name: "Anthropic's docs on themes" }).getAttribute('href'),
    ).toBe('https://code.claude.com/docs/en/terminal-config#create-a-custom-theme')
    expect(screen.queryByRole('link', { name: 'Browse mods' })).toBeNull()
  })

  // Every way's words and docs link are in the page from the first paint, for search engines and
  // readers without script; only the pick's show.
  it('carries every way’s docs link in the page, showing only the pick’s', () => {
    const { container } = render(<CustomizeHero />)
    expect(container.querySelectorAll('a[href^="https://code.claude.com/docs/en/"]')).toHaveLength(
      8,
    )
    expect(screen.getAllByRole('link', { name: /^Anthropic's docs/ })).toHaveLength(1)
  })
})
