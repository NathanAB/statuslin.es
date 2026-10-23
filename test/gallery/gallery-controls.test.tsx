// @vitest-environment jsdom

import { fireEvent, render, screen, within } from '@testing-library/react'
import { cloneElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const navigate = vi.fn()
const capture = vi.fn()

vi.mock('@posthog/react', () => ({
  usePostHog: () => ({ capture }),
}))

// A Link's search function, applied to this previous search, shows up as data-search.
const PREV_SEARCH = { sort: 'top', tags: 'git', kind: 'mods', page: 2 }
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    children,
    search,
    resetScroll: _resetScroll,
    from: _from,
    ...props
  }: {
    to: string
    children: React.ReactNode
    search?: (prev: Record<string, unknown>) => Record<string, unknown>
    resetScroll?: boolean
    from?: string
  }) => (
    <a href={to} data-search={search ? JSON.stringify(search(PREV_SEARCH)) : undefined} {...props}>
      {children}
    </a>
  ),
  useNavigate: () => navigate,
}))

vi.mock('@/ui/button', () => ({
  Button: ({ asChild, children, ...props }: { asChild?: boolean; children: React.ReactNode }) =>
    asChild ? (
      cloneElement(children as React.ReactElement, props)
    ) : (
      <button type="button" {...props}>
        {children}
      </button>
    ),
}))

const { GalleryControls } = await import('@/gallery/gallery-controls')

afterEach(() => {
  navigate.mockClear()
  capture.mockClear()
})

describe('GalleryControls analytics', () => {
  it('offers no tag filter', () => {
    render(<GalleryControls kind="all" sort="trending" tags={[]} />)

    expect(screen.queryByRole('button', { name: /filter/i })).toBeNull()
  })

  it('captures clearing a tag filter that arrived in the URL', () => {
    render(<GalleryControls kind="all" sort="top" tags={['git']} />)

    fireEvent.click(screen.getByRole('link', { name: 'Clear filters' }))

    expect(capture).toHaveBeenCalledWith('gallery_filter_changed', {
      action: 'clear',
      selectedTags: [],
      sort: 'top',
      page: 1,
      kind: 'all',
    })
  })

  it('captures sort changes with the active filter state', () => {
    render(<GalleryControls kind="mods" sort="trending" tags={['git']} />)

    fireEvent.click(screen.getByRole('radio', { name: 'Top' }))

    expect(capture).toHaveBeenCalledWith('gallery_sort_changed', {
      sort: 'top',
      selectedTags: ['git'],
      page: 1,
      kind: 'mods',
    })
  })
})

describe('GalleryControls sort', () => {
  // The sort sits beside the filter as a small segmented control, so "Trending" is always on screen.
  it('is one segmented control, with the active sort checked', () => {
    render(<GalleryControls kind="all" sort="top" tags={[]} />)

    const group = screen.getByRole('radiogroup', { name: 'Sort' })
    expect(
      within(group)
        .getAllByRole('radio')
        .map((r) => [r.textContent, r.getAttribute('aria-checked')]),
    ).toEqual([
      ['Trending', 'false'],
      ['Top', 'true'],
      ['New', 'false'],
    ])
  })

  it('writes the chosen sort to the URL and resets the page', () => {
    render(<GalleryControls kind="all" sort="trending" tags={['git']} />)

    fireEvent.click(screen.getByRole('radio', { name: 'New' }))
    const call = navigate.mock.calls[0]?.[0] as
      | { search: (prev: Record<string, unknown>) => Record<string, unknown> }
      | undefined
    expect(call?.search({ tags: 'git', page: 3 })).toEqual({ tags: 'git', sort: 'new' })
  })
})

// What the gallery shows is no longer a control: status lines and mods are one list. A kind that
// arrives in the URL still filters, and Clear filters drops it with any tags.
describe('GalleryControls without a kind filter', () => {
  it('offers no kind control', () => {
    render(<GalleryControls kind="all" sort="trending" tags={[]} />)
    expect(screen.queryByRole('radio', { name: 'Mods' })).toBeNull()
    expect(screen.queryByRole('radio', { name: 'Status lines' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Clear filters' })).toBeNull()
  })

  it('clears a kind that arrived in the URL, with any tags', () => {
    render(<GalleryControls kind="mods" sort="top" tags={[]} />)
    const clear = screen.getByRole('link', { name: 'Clear filters' })
    expect(JSON.parse(clear.getAttribute('data-search') ?? '{}')).toEqual({ sort: 'top' })
  })
})
