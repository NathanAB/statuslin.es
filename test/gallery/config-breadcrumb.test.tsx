// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    params,
    children,
  }: {
    to: string
    params?: Record<string, string>
    children: React.ReactNode
  }) => <a href={params ? to.replace('$facet', params.facet ?? '') : to}>{children}</a>,
}))

const { ConfigBreadcrumb } = await import('@/gallery/config-breadcrumb')

const trail = () =>
  screen.getByRole('navigation', { name: 'Breadcrumb' }).textContent?.replace(/\s+/g, ' ').trim()

describe('ConfigBreadcrumb', () => {
  it('shows Status lines › facet heading › config, linking the first two', () => {
    render(
      <ConfigBreadcrumb
        title="Powerline Dracula"
        primaryFacet={{ slug: 'git', heading: 'Claude Code status lines that show git status' }}
      />,
    )
    expect(trail()).toBe(
      'Status lines›Claude Code status lines that show git status›Powerline Dracula',
    )
    expect(screen.getAllByRole('link').map((a) => [a.textContent, a.getAttribute('href')])).toEqual(
      [
        ['Status lines', '/'],
        ['Claude Code status lines that show git status', '/status-lines/git'],
      ],
    )
  })

  it('goes straight from Status lines to the config without a primary facet', () => {
    render(<ConfigBreadcrumb title="Solo" primaryFacet={null} />)
    expect(trail()).toBe('Status lines›Solo')
  })
})
