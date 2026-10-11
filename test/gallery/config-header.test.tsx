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
  }) => <a href={params ? to.replace(/\$(\w+)/g, (_, k) => params[k] ?? '') : to}>{children}</a>,
}))

const { ConfigHeader } = await import('@/gallery/config-header')

const DETAIL = {
  title: 'Powerline Dracula',
  description: 'A Powerline-style status line.',
  author: { name: 'Lindsey B', username: 'LindseyB', image: 'https://example.com/lindsey.png' },
  tags: ['bash'],
  networkHosts: [],
  license: null,
  sourceUrl: null,
  primaryFacet: null,
}

const trail = () =>
  screen.getByRole('navigation', { name: 'Breadcrumb' }).textContent?.replace(/\s+/g, ' ').trim()

describe('ConfigHeader', () => {
  it('breadcrumbs through the primary facet page, linking home and the facet', () => {
    render(
      <ConfigHeader
        detail={{
          ...DETAIL,
          primaryFacet: { slug: 'git', heading: 'Claude Code status lines that show git status' },
        }}
      />,
    )

    expect(trail()).toBe(
      'Status lines›Claude Code status lines that show git status›Powerline Dracula',
    )
    expect(
      screen.getByRole('link', { name: 'Claude Code status lines that show git status' }),
    ).toHaveProperty('pathname', '/status-lines/git')
  })

  it('goes straight from home to the status line without a primary facet', () => {
    render(<ConfigHeader detail={DETAIL} />)

    expect(trail()).toBe('Status lines›Powerline Dracula')
  })

  it('shows the status line’s chips beside the title', () => {
    render(<ConfigHeader detail={DETAIL} />)

    expect(screen.getByRole('link', { name: /bash/i })).toHaveProperty(
      'pathname',
      '/status-lines/bash',
    )
  })

  it('credits a submitter’s status line to its author alone, with no licence', () => {
    render(<ConfigHeader detail={DETAIL} />)

    expect(screen.getByRole('link', { name: /@LindseyB/ })).toBeTruthy()
    expect(screen.queryByText('·')).toBeNull()
    expect(screen.queryByText(/licen[cs]/)).toBeNull()
  })

  it('puts the original source and the licence in the byline for a seeded status line', () => {
    render(
      <ConfigHeader detail={{ ...DETAIL, license: 'MIT', sourceUrl: 'https://example.com/x' }} />,
    )

    const dots = screen.getAllByText('·')
    expect(dots.map((dot) => dot.parentElement?.textContent)).toEqual([
      '·original source',
      '·MIT licensed',
    ])
    expect(screen.getByRole('link', { name: 'original source' }).getAttribute('href')).toBe(
      'https://example.com/x',
    )
  })

  it('links the original source even without a licence', () => {
    render(<ConfigHeader detail={{ ...DETAIL, sourceUrl: 'https://example.com/x' }} />)

    expect(screen.getByRole('link', { name: 'original source' })).toBeTruthy()
    expect(screen.queryByText(/licensed/)).toBeNull()
  })

  it('names the licence without a source link when the source is unknown', () => {
    render(<ConfigHeader detail={{ ...DETAIL, license: 'MIT' }} />)

    expect(screen.getByText('MIT licensed')).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'original source' })).toBeNull()
  })
})
