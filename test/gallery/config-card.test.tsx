// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GalleryCard } from '@/gallery/queries'

const capture = vi.fn()

vi.mock('@posthog/react', () => ({
  usePostHog: () => ({ capture }),
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    params,
    children,
    onClick,
    ...props
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
      {...props}
    >
      {children}
    </a>
  ),
}))

const { GalleryConfigCard } = await import('@/gallery/config-card')

afterEach(() => capture.mockClear())

const exampleCard: GalleryCard = {
  configId: 'config-1',
  slug: 'example',
  title: 'Example',
  description: 'An example status line.',
  interpreter: 'bash',
  copyCount: 2,
  author: null,
  preview: null,
  networkHosts: [],
  readsClaudeToken: false,
  tags: [],
}

describe('GalleryConfigCard', () => {
  it('links its title to the status line page', () => {
    render(<GalleryConfigCard card={exampleCard} />)

    expect(screen.getByRole('link', { name: 'Example' }).getAttribute('href')).toBe('/c/example')
  })

  // The A2 row names no kind for a status line; a mod row says Mod.
  it('has no kind chip', () => {
    render(<GalleryConfigCard card={exampleCard} />)

    expect(screen.queryByText('Status line')).toBeNull()
  })

  it("keeps the author's GitHub link clickable above the card's overlay, with no avatar", () => {
    const { container } = render(
      <GalleryConfigCard
        card={{ ...exampleCard, author: { name: 'Octo', username: 'octocat', image: 'a.png' } }}
      />,
    )

    const author = screen.getByRole('link', { name: '@octocat' })
    expect(author.getAttribute('href')).toBe('https://github.com/octocat')
    expect(author.closest('.z-10')).toBeTruthy()
    expect(container.querySelector('img')).toBeNull()
  })

  it('shows the status line, then the whole description', () => {
    render(
      <GalleryConfigCard
        card={{ ...exampleCard, preview: [{ text: 'main · ctx 22%' }], tags: ['git'] }}
      />,
    )

    const line = screen.getByText('main · ctx 22%')
    const description = screen.getByText('An example status line.')
    expect(
      line.compareDocumentPosition(description) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Git' }).getAttribute('href')).toBe('/status-lines/git')
  })

  it('says so when there is no preview yet', () => {
    render(<GalleryConfigCard card={exampleCard} />)

    expect(screen.getByText('No preview.')).toBeTruthy()
  })
})

describe('GalleryConfigCard analytics', () => {
  it('captures the discovery context when a card opens', () => {
    render(
      <GalleryConfigCard
        card={exampleCard}
        analytics={{
          surface: 'home',
          position: 2,
          page: 1,
          sort: 'trending',
          selectedTags: ['git'],
          kind: 'status-lines',
        }}
      />,
    )

    fireEvent.click(screen.getByRole('link', { name: 'Example' }))
    expect(screen.getByText('2 copies')).toBeTruthy()
    expect(screen.queryByText(/⇧|upvote/i)).toBeNull()

    expect(capture).toHaveBeenCalledWith('statusline_card_clicked', {
      configId: 'config-1',
      slug: 'example',
      surface: 'home',
      position: 2,
      sort: 'trending',
      page: 1,
      selectedTags: ['git'],
      kind: 'status-lines',
    })
  })
})
