// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

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
      href={params ? to.replace('$slug', params.slug ?? '') : to}
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

const exampleCard = {
  configId: 'config-1',
  slug: 'example',
  title: 'Example',
  description: 'An example status line.',
  interpreter: 'bash' as const,
  copyCount: 2,
  author: null,
  preview: null,
  networkHosts: [],
  readsClaudeToken: false,
  tags: [],
}

describe('GalleryConfigCard', () => {
  it('names its kind with a Status line chip, as mod cards say Mod', () => {
    render(<GalleryConfigCard card={exampleCard} />)

    expect(screen.getByText('Status line')).toBeTruthy()
  })

  it("keeps the author's GitHub link clickable above the card's overlay", () => {
    render(
      <GalleryConfigCard
        card={{ ...exampleCard, author: { name: 'Octo', username: 'octocat', image: null } }}
      />,
    )

    const author = screen.getByRole('link', { name: '@octocat' })
    expect(author.getAttribute('href')).toBe('https://github.com/octocat')
    expect(author.closest('.z-10')).toBeTruthy()
  })
})

describe('GalleryConfigCard analytics', () => {
  it('captures the discovery context when a card opens', () => {
    render(
      <GalleryConfigCard
        card={{
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
        }}
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
