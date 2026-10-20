// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GalleryModCard } from '@/gallery/gallery-items'
import { githubAvatarUrl } from '@/lib/github-avatars'

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
      href={params ? to.replace(/\$(\w+)/g, (_, k) => params[k] ?? '') : to}
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
  it('links its title to the mod page and says it is a mod', () => {
    render(<ModCard card={card} />)

    expect(screen.getByRole('link', { name: 'Meter' }).getAttribute('href')).toBe('/mods/meter')
    expect(screen.getByText('Mod')).toBeTruthy()
    expect(screen.getByText('3 installs')).toBeTruthy()
  })

  it("keeps the author's GitHub link, with their avatar, clickable above the card's overlay", () => {
    render(<ModCard card={card} />)

    const author = screen.getByRole('link', { name: '@octocat' })
    expect(author.getAttribute('href')).toBe('https://github.com/octocat')
    expect(author.closest('.z-10')).toBeTruthy()
    expect(author.querySelector('img')?.getAttribute('src')).toBe(githubAvatarUrl('octocat'))
  })

  it('shows its terminal preview and description while it has no Desktop shot', () => {
    render(<ModCard card={card} />)

    expect(screen.getByText('ctx 42%')).toBeTruthy()
    expect(screen.getByText('Shows the context meter.')).toBeTruthy()
  })

  it('shows its Desktop shot in place of the terminal preview, sized and lazy', () => {
    render(<ModCard card={{ ...card, desktopShot: SHOT }} />)

    const image = screen.getByRole('img', { name: 'Meter in Claude Desktop' })
    expect(image.getAttribute('src')).toBe(SHOT.src)
    expect(image.getAttribute('width')).toBe('790')
    expect(image.getAttribute('height')).toBe('52')
    expect(image.getAttribute('loading')).toBe('lazy')
    expect(screen.queryByText('ctx 42%')).toBeNull()
  })

  it('says so when it has no preview at all', () => {
    render(<ModCard card={{ ...card, preview: null }} />)

    expect(screen.getByText('No preview.')).toBeTruthy()
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
