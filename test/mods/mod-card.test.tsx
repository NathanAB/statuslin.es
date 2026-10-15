// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GalleryModCard } from '@/gallery/gallery-items'

const capture = vi.fn()
vi.mock('@posthog/react', () => ({ usePostHog: () => ({ capture }) }))

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    params,
    children,
    onClick,
  }: {
    to: string
    params?: Record<string, string>
    children: React.ReactNode
    onClick?: React.MouseEventHandler<HTMLAnchorElement>
  }) => (
    <a
      href={params ? to.replace('$slug', params.slug ?? '') : to}
      onClick={(event) => {
        event.preventDefault()
        onClick?.(event)
      }}
    >
      {children}
    </a>
  ),
}))

afterEach(() => capture.mockClear())

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
  desktopShot: null,
}

const SHOT = {
  src: '/mod-previews/v1/desktop.png?r=1&image=card',
  width: 790,
  height: 52,
}

describe('ModCard', () => {
  it('links its title to the mod page', () => {
    render(<ModCard card={card} />)

    expect(screen.getByRole('link', { name: 'Meter' }).getAttribute('href')).toBe('/mods/meter')
  })

  it('gives the title row its natural width, like the status line card', () => {
    render(<ModCard card={{ ...card, title: 'A long mod title that wraps on a phone' }} />)

    const title = screen.getByRole('link', { name: 'A long mod title that wraps on a phone' })
    const titleRow = title.closest('h3')?.parentElement
    expect(titleRow?.className).not.toContain('flex-1')
  })

  it('shows the author, with their GitHub avatar, and the terminal preview', () => {
    const { container } = render(<ModCard card={card} />)

    expect(screen.getByText('@octocat')).toBeTruthy()
    expect(
      container.querySelector('img[src="https://avatars.githubusercontent.com/octocat?s=40"]'),
    ).toBeTruthy()
    expect(screen.getByText('ctx 42%')).toBeTruthy()
    expect(screen.getByText('Shows the context meter.')).toBeTruthy()
  })

  it("keeps the author's GitHub link clickable above the card's overlay", () => {
    render(<ModCard card={card} />)

    const author = screen.getByRole('link', { name: '@octocat' })
    expect(author.getAttribute('href')).toBe('https://github.com/octocat')
    expect(author.closest('.z-10')).toBeTruthy()
  })

  it('labels the terminal preview and leaves out a Desktop slot when there is no shot', () => {
    render(<ModCard card={card} />)

    expect(screen.getByText('Terminal')).toBeTruthy()
    expect(screen.queryByText('Claude Desktop')).toBeNull()
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('shows the terminal on top and the Desktop shot below it, each labelled', () => {
    render(<ModCard card={{ ...card, desktopShot: SHOT }} />)

    const terminal = screen.getByText('Terminal')
    const desktop = screen.getByText('Claude Desktop')
    const image = screen.getByRole('img', { name: 'Meter in Claude Desktop' })
    expect(image.getAttribute('src')).toBe(SHOT.src)
    expect(image.getAttribute('width')).toBe('790')
    expect(
      terminal.compareDocumentPosition(desktop) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(desktop.compareDocumentPosition(image) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('shows only the Desktop shot for a mod that draws nothing in the terminal', () => {
    render(<ModCard card={{ ...card, preview: null, desktopShot: SHOT }} />)

    expect(screen.queryByText('Terminal')).toBeNull()
    expect(screen.getByText('Claude Desktop')).toBeTruthy()
    expect(screen.getByRole('img', { name: 'Meter in Claude Desktop' })).toBeTruthy()
  })
})

describe('ModCard analytics', () => {
  it('captures the mod and where it was clicked when the card opens', () => {
    render(
      <ModCard
        card={card}
        analytics={{ surface: 'home', position: 4, page: 1, sort: 'trending', kind: 'all' }}
      />,
    )

    fireEvent.click(screen.getByRole('link', { name: 'Meter' }))

    expect(capture).toHaveBeenCalledWith('mod_card_clicked', {
      modId: 'mod-1',
      slug: 'meter',
      surface: 'home',
      position: 4,
      page: 1,
      sort: 'trending',
      kind: 'all',
    })
  })

  it('captures nothing without a surface to name', () => {
    render(<ModCard card={card} />)

    fireEvent.click(screen.getByRole('link', { name: 'Meter' }))

    expect(capture).not.toHaveBeenCalled()
  })
})
