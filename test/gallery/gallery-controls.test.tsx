// @vitest-environment jsdom

import { fireEvent, render, screen, within } from '@testing-library/react'
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

    fireEvent.click(screen.getByRole('button', { name: 'Top' }))

    expect(capture).toHaveBeenCalledWith('gallery_sort_changed', {
      sort: 'top',
      selectedTags: ['git'],
      page: 1,
      kind: 'mods',
    })
  })

  it('captures switching what the gallery shows, from what it showed', () => {
    render(<GalleryControls kind="all" sort="new" tags={['git']} />)

    fireEvent.click(screen.getByRole('radio', { name: 'Mods' }))

    expect(capture).toHaveBeenCalledWith('gallery_kind_changed', {
      kind: 'mods',
      previousKind: 'all',
      sort: 'new',
      selectedTags: ['git'],
    })
  })
})

describe('GalleryControls kind filter', () => {
  const searchAfterClicking = (name: string, prev: Record<string, unknown>) => {
    fireEvent.click(screen.getByRole('radio', { name }))
    const call = navigate.mock.calls[0]?.[0] as
      | { search: (prev: Record<string, unknown>) => Record<string, unknown> }
      | undefined
    return call?.search(prev)
  }

  it('is one segmented control, with the active kind checked', () => {
    render(<GalleryControls kind="mods" sort="trending" tags={[]} />)

    const group = screen.getByRole('radiogroup', { name: 'Show' })
    expect(
      within(group)
        .getAllByRole('radio')
        .map((r) => r.textContent),
    ).toEqual(['All', 'Status lines', 'Mods'])
    expect(screen.getByRole('radio', { name: 'Mods' }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('radio', { name: 'All' }).getAttribute('aria-checked')).toBe('false')
  })

  it('writes the chosen kind to the URL and resets the page', () => {
    render(<GalleryControls kind="all" sort="new" tags={['git']} />)

    expect(searchAfterClicking('Status lines', { sort: 'new', tags: 'git', page: 3 })).toEqual({
      sort: 'new',
      tags: 'git',
      kind: 'status-lines',
    })
  })

  it('leaves All out of the URL', () => {
    render(<GalleryControls kind="mods" sort="trending" tags={[]} />)

    expect(searchAfterClicking('All', { kind: 'mods', page: 2 })).toEqual({})
  })

  it('keeps the active kind when it is clicked again', () => {
    render(<GalleryControls kind="mods" sort="trending" tags={[]} />)

    fireEvent.click(screen.getByRole('radio', { name: 'Mods' }))

    expect(navigate).not.toHaveBeenCalled()
    expect(capture).not.toHaveBeenCalled()
  })
})
