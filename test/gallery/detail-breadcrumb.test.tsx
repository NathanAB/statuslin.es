// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    params,
    search,
    children,
  }: {
    to: string
    params?: Record<string, string>
    search?: Record<string, string>
    children: React.ReactNode
  }) => {
    let href = params ? to.replace(/\$(\w+)/g, (_, k) => params[k] ?? '') : to
    if (search) href += `?${new URLSearchParams(search).toString()}`
    return <a href={href}>{children}</a>
  },
}))

const { DetailBreadcrumb } = await import('@/gallery/detail-breadcrumb')

const trail = () =>
  screen.getByRole('navigation', { name: 'Breadcrumb' }).textContent?.replace(/\s+/g, ' ').trim()

const links = () =>
  screen.getAllByRole('link').map((a) => [a.textContent, a.getAttribute('href')] as const)

describe('DetailBreadcrumb', () => {
  it('leads with the home crumb, links each parent, and ends on the unlinked title', () => {
    render(
      <DetailBreadcrumb
        title="Powerline Dracula"
        trail={[
          {
            name: 'Claude Code status lines that show git status',
            to: '/status-lines/$facet',
            params: { facet: 'git' },
          },
        ]}
      />,
    )

    expect(trail()).toBe(
      'statuslin.es›Claude Code status lines that show git status›Powerline Dracula',
    )
    expect(links()).toEqual([
      ['statuslin.es', '/'],
      ['Claude Code status lines that show git status', '/status-lines/git'],
    ])
  })

  it('carries a parent crumb’s search params into its link', () => {
    render(
      <DetailBreadcrumb
        title="Token Weather"
        trail={[{ name: 'Mods', to: '/', search: { kind: 'mods' } }]}
      />,
    )

    expect(trail()).toBe('statuslin.es›Mods›Token Weather')
    expect(links()).toEqual([
      ['statuslin.es', '/'],
      ['Mods', '/?kind=mods'],
    ])
  })

  it('goes straight from home to the title with no parents', () => {
    render(<DetailBreadcrumb title="Solo" trail={[]} />)

    expect(trail()).toBe('statuslin.es›Solo')
  })
})
