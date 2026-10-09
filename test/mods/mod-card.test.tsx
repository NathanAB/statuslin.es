// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { GalleryModCard } from '@/gallery/gallery-items'

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    params,
    children,
  }: {
    to: string
    params?: Record<string, string>
    children: React.ReactNode
  }) => <a href={params ? to.replace('$slug', params.slug ?? '') : to}>{children}</a>,
}))

const { ModCard } = await import('@/mods/mod-card')

const card: GalleryModCard = {
  modId: 'mod-1',
  slug: 'meter',
  title: 'Meter',
  description: 'Shows the context meter.',
  authorGithub: 'octocat',
  copyCount: 3,
  tags: [],
  preview: [{ text: 'ctx 42%' }],
  desktopScreenshot: null,
}

describe('ModCard', () => {
  it('links its title to the mod page', () => {
    render(<ModCard card={card} />)

    expect(screen.getByRole('link', { name: 'Meter' }).getAttribute('href')).toBe('/mods/meter')
  })

  it('shows the author and the terminal preview', () => {
    render(<ModCard card={card} />)

    expect(screen.getByText('@octocat')).toBeTruthy()
    expect(screen.getByText('ctx 42%')).toBeTruthy()
    expect(screen.getByText('Shows the context meter.')).toBeTruthy()
  })

  it('labels a Desktop screenshot when the mod has no terminal preview', () => {
    render(<ModCard card={{ ...card, preview: null, desktopScreenshot: '/mods/meter.png' }} />)

    const figure = screen.getByRole('figure')
    expect(figure.querySelector('figcaption')?.textContent).toBe('Claude Desktop, screenshot')
    expect(figure.querySelector('img')?.getAttribute('src')).toBe('/mods/meter.png')
  })
})
