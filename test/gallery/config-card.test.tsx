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
    ...props
  }: {
    to: string
    params?: Record<string, string>
    children: React.ReactNode
  }) => (
    <a href={params ? to.replace('$slug', params.slug ?? '') : to} {...props}>
      {children}
    </a>
  ),
}))

const { GalleryConfigCard } = await import('@/gallery/config-card')

afterEach(() => capture.mockClear())

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
          upvoteCount: 3,
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
        }}
      />,
    )

    fireEvent.click(screen.getByRole('link', { name: 'Example' }))

    expect(capture).toHaveBeenCalledWith('statusline_card_clicked', {
      configId: 'config-1',
      slug: 'example',
      surface: 'home',
      position: 2,
      sort: 'trending',
      page: 1,
      selectedTags: ['git'],
    })
  })
})
