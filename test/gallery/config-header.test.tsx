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
  it('breadcrumbs through the primary topic page by its short name, linking home and the topic', () => {
    render(<ConfigHeader detail={{ ...DETAIL, primaryFacet: { slug: 'git', topic: 'Git' } }} />)

    expect(trail()).toBe('statuslin.es›Git›Powerline Dracula')
    expect(screen.getByRole('link', { name: 'Git' })).toHaveProperty(
      'pathname',
      '/status-lines/git',
    )
  })

  it('goes straight from home to the status line without a primary facet', () => {
    render(<ConfigHeader detail={DETAIL} />)

    expect(trail()).toBe('statuslin.es›Powerline Dracula')
  })

  it('shows the status line’s chips beside the title', () => {
    render(<ConfigHeader detail={DETAIL} />)

    expect(screen.getByRole('link', { name: /bash/i })).toHaveProperty(
      'pathname',
      '/status-lines/bash',
    )
  })

  it('credits a submitter’s status line to its author alone, with no license', () => {
    render(<ConfigHeader detail={DETAIL} />)

    expect(screen.getByRole('link', { name: /@LindseyB/ })).toBeTruthy()
    expect(screen.queryByText('·')).toBeNull()
    expect(screen.queryByText(/licen[cs]/)).toBeNull()
  })

  it('puts the original source and the license in the byline for a seeded status line', () => {
    render(
      <ConfigHeader detail={{ ...DETAIL, license: 'MIT', sourceUrl: 'https://example.com/x' }} />,
    )

    const dots = screen.getAllByText('·')
    expect(dots.map((dot) => dot.parentElement?.textContent)).toEqual([
      '·original source',
      '·MIT license',
    ])
    expect(screen.getByRole('link', { name: 'original source' }).getAttribute('href')).toBe(
      'https://example.com/x',
    )
  })

  it('links the original source even without a license', () => {
    render(<ConfigHeader detail={{ ...DETAIL, sourceUrl: 'https://example.com/x' }} />)

    expect(screen.getByRole('link', { name: 'original source' })).toBeTruthy()
    expect(screen.queryByText(/license/)).toBeNull()
  })

  it('names the license without a source link when the source is unknown', () => {
    render(<ConfigHeader detail={{ ...DETAIL, license: 'MIT' }} />)

    expect(screen.getByText('MIT license')).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'original source' })).toBeNull()
  })
})
