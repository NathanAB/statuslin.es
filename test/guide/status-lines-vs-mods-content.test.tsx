// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { STATUS_LINES_VS_MODS_FAQ } from '@/guide/status-lines-vs-mods-faq'
import { STATUSLINE_ANYWHERE_MIN_CLAUDE_CODE } from '@/lib/statusline-anywhere'
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

const { StatusLinesVsModsContent } = await import('@/guide/status-lines-vs-mods-content')

describe('StatusLinesVsModsContent', () => {
  it('renders the h1 and a section per question a reader brings', () => {
    render(<StatusLinesVsModsContent />)
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
    render(<StatusLinesVsModsContent />)
    const table = screen.getByRole('table')
    expect(table.textContent).toMatch(/status line/i)
    expect(table.textContent).toMatch(/mod/i)
    expect(screen.getByRole('rowheader', { name: /claude desktop/i })).toBeTruthy()
  })

  it('states the Claude Code versions mods and statusline-anywhere need', () => {
    const { container } = render(<StatusLinesVsModsContent />)
    expect(container.textContent).toContain(`Claude Code ${MOD_INSTALL_MIN_VERSION} or later`)
    expect(container.textContent).toContain(
      `Claude Code ${STATUSLINE_ANYWHERE_MIN_CLAUDE_CODE} or later`,
    )
  })

  it('links the mods, the gallery, the other guides and statusline-anywhere', () => {
    const { container } = render(<StatusLinesVsModsContent />)
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

  it('answers its common questions', () => {
    render(<StatusLinesVsModsContent />)
    for (const entry of STATUS_LINES_VS_MODS_FAQ) {
      expect(screen.getByRole('heading', { level: 3, name: entry.question })).toBeTruthy()
    }
  })

  it('writes "status line" as two words and uses no em dashes', () => {
    const { container } = render(<StatusLinesVsModsContent />)
    const prose = (container.textContent ?? '').replace(
      /statusline-anywhere|statusLine|\/statusline/g,
      '',
    )
    expect(prose).not.toMatch(/statusline/i)
    expect(prose).not.toContain('—')
  })
})
