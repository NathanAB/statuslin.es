// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react'
import { Children, cloneElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const navigate = vi.fn()
const capture = vi.fn()

vi.mock('@posthog/react', () => ({
  usePostHog: () => ({ capture }),
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...props }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...props}>
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

vi.mock('@/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuButtonTrigger: ({ label }: { label: string }) => (
    <button type="button">{label}</button>
  ),
  DropdownMenuCheckboxItem: ({
    children,
    checked,
    onSelect,
  }: {
    children: React.ReactNode
    checked?: boolean
    onSelect?: (event: { preventDefault: () => void }) => void
  }) => (
    <button
      type="button"
      aria-checked={checked}
      role="menuitemcheckbox"
      onClick={() => onSelect?.({ preventDefault: vi.fn() })}
    >
      {children}
    </button>
  ),
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuRadioGroup: ({
    children,
    onValueChange,
  }: {
    children: React.ReactNode
    onValueChange: (value: string) => void
  }) => (
    <div>
      {Children.map(children, (child) =>
        cloneElement(child as React.ReactElement<{ onValueChange?: (value: string) => void }>, {
          onValueChange,
        }),
      )}
    </div>
  ),
  DropdownMenuRadioItem: ({
    children,
    value,
    onValueChange,
  }: {
    children: React.ReactNode
    value?: string
    onValueChange?: (value: string) => void
  }) => (
    <button type="button" onClick={() => onValueChange?.(value ?? '')}>
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
  it('captures a tag addition with the resulting filter state', () => {
    render(<GalleryControls kind="all" sort="trending" tags={[]} available={['git']} />)

    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Git' }))

    expect(capture).toHaveBeenCalledWith('gallery_filter_changed', {
      action: 'add',
      tag: 'git',
      selectedTags: ['git'],
      sort: 'trending',
      page: 1,
    })
  })

  it('captures a tag removal with the resulting filter state', () => {
    render(<GalleryControls kind="all" sort="new" tags={['git']} available={['git']} />)

    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Git' }))

    expect(capture).toHaveBeenCalledWith('gallery_filter_changed', {
      action: 'remove',
      tag: 'git',
      selectedTags: [],
      sort: 'new',
      page: 1,
    })
  })

  it('captures clearing filters', () => {
    render(<GalleryControls kind="all" sort="top" tags={['git']} available={['git']} />)

    fireEvent.click(screen.getByRole('link', { name: 'Clear filters' }))

    expect(capture).toHaveBeenCalledWith('gallery_filter_changed', {
      action: 'clear',
      selectedTags: [],
      sort: 'top',
      page: 1,
    })
  })

  it('captures sort changes with the active filter state', () => {
    render(<GalleryControls kind="all" sort="trending" tags={['git']} available={['git']} />)

    fireEvent.click(screen.getByRole('button', { name: 'Top' }))

    expect(capture).toHaveBeenCalledWith('gallery_sort_changed', {
      sort: 'top',
      selectedTags: ['git'],
      page: 1,
    })
  })
})

describe('GalleryControls kind filter', () => {
  const searchAfterClicking = (name: string, prev: Record<string, unknown>) => {
    fireEvent.click(screen.getByRole('button', { name }))
    const { search } = navigate.mock.calls[0]?.[0] as {
      search: (prev: Record<string, unknown>) => Record<string, unknown>
    }
    return search(prev)
  }

  it('marks the active kind as pressed', () => {
    render(<GalleryControls kind="mods" sort="trending" tags={[]} available={[]} />)

    expect(screen.getByRole('button', { name: 'Mods' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'All' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('writes the chosen kind to the URL and resets the page', () => {
    render(<GalleryControls kind="all" sort="new" tags={['git']} available={['git']} />)

    expect(searchAfterClicking('Status lines', { sort: 'new', tags: 'git', page: 3 })).toEqual({
      sort: 'new',
      tags: 'git',
      kind: 'status-lines',
    })
  })

  it('leaves All out of the URL', () => {
    render(<GalleryControls kind="mods" sort="trending" tags={[]} available={[]} />)

    expect(searchAfterClicking('All', { kind: 'mods', page: 2 })).toEqual({})
  })
})
