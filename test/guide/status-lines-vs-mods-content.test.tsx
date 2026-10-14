// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { STATUS_LINES_VS_MODS_FAQ } from '@/guide/status-lines-vs-mods-faq'
import {
  STATUSLINE_ANYWHERE_MIN_CLAUDE_CODE,
  STATUSLINE_ANYWHERE_URL,
} from '@/lib/statusline-anywhere'
import type { ModDesktopShot } from '@/mods/desktop-shot'
import { MOD_INSTALL_MIN_VERSION } from '@/mods/install'

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

vi.mock('@posthog/react', () => ({
  usePostHog: () => ({ capture: vi.fn() }),
}))

const { StatusLinesVsModsContent } = await import('@/guide/status-lines-vs-mods-content')

const PUBLISHED: ModDesktopShot = { kind: 'no-shot' }
const UNPUBLISHED: ModDesktopShot = { kind: 'unpublished' }

describe('StatusLinesVsModsContent', () => {
  it('renders the h1 and a section per question a reader brings', () => {
    render(<StatusLinesVsModsContent statuslineAnywhere={PUBLISHED} />)
    expect(
      screen.getByRole('heading', { level: 1, name: /claude code status lines vs mods/i }),
    ).toBeTruthy()
    for (const heading of [
      /what a status line is/i,
      /what a mod is/i,
      /where each one shows up/i,
      /which one to pick/i,
      /your status line in claude desktop/i,
      /common questions/i,
    ]) {
      expect(screen.getByRole('heading', { level: 2, name: heading })).toBeTruthy()
    }
  })

  it('compares where each one shows up, Claude Desktop included', () => {
    render(<StatusLinesVsModsContent statuslineAnywhere={PUBLISHED} />)
    const table = screen.getByRole('table')
    expect(table.textContent).toMatch(/status line/i)
    expect(table.textContent).toMatch(/mod/i)
    expect(screen.getByRole('rowheader', { name: /claude desktop/i })).toBeTruthy()
  })

  it('states the Claude Code versions mods and statusline-anywhere need', () => {
    const { container } = render(<StatusLinesVsModsContent statuslineAnywhere={PUBLISHED} />)
    expect(container.textContent).toContain(`Claude Code ${MOD_INSTALL_MIN_VERSION} or later`)
    expect(container.textContent).toContain(
      `Claude Code ${STATUSLINE_ANYWHERE_MIN_CLAUDE_CODE} or later`,
    )
  })

  it('links the mods, the gallery, the other guides and statusline-anywhere', () => {
    const { container } = render(<StatusLinesVsModsContent statuslineAnywhere={PUBLISHED} />)
    for (const href of [
      '/mods',
      '/',
      '/guide',
      '/guide/claude-desktop',
      '/mods/statusline-anywhere',
      '/guide/are-claude-code-mods-safe',
    ]) {
      expect(container.querySelector(`a[href="${href}"]`), href).not.toBeNull()
    }
  })

  it('links statusline-anywhere on GitHub, not its missing mod page, while it is unpublished', () => {
    const { container } = render(<StatusLinesVsModsContent statuslineAnywhere={UNPUBLISHED} />)
    expect(container.querySelector('a[href="/mods/statusline-anywhere"]')).toBeNull()
    const section = screen.getByRole('heading', {
      level: 2,
      name: /your status line in claude desktop/i,
    }).parentElement as HTMLElement
    expect(section.querySelector(`a[href="${STATUSLINE_ANYWHERE_URL}"]`)?.textContent).toBe(
      'statusline-anywhere',
    )
  })

  it('answers its common questions', () => {
    render(<StatusLinesVsModsContent statuslineAnywhere={PUBLISHED} />)
    for (const entry of STATUS_LINES_VS_MODS_FAQ) {
      expect(screen.getByRole('heading', { level: 3, name: entry.question })).toBeTruthy()
    }
  })

  it('says a mod reads most, not all, of the numbers a status line gets', () => {
    const { container } = render(<StatusLinesVsModsContent statuslineAnywhere={PUBLISHED} />)
    const answer = screen.getByRole('heading', {
      level: 3,
      name: 'Can a mod show the same numbers as my status line?',
    }).nextElementSibling
    expect(answer?.textContent).toMatch(/^Mostly\./)
    expect(container.textContent).toContain(
      'A few status line fields, such as lines added and removed, have no mod equivalent yet.',
    )
  })

  it('writes "status line" as two words and uses no em dashes', () => {
    const { container } = render(<StatusLinesVsModsContent statuslineAnywhere={PUBLISHED} />)
    const prose = (container.textContent ?? '').replace(
      /statusline-anywhere|statusLine|\/statusline/g,
      '',
    )
    expect(prose).not.toMatch(/statusline/i)
    expect(prose).not.toContain('—')
  })
})
