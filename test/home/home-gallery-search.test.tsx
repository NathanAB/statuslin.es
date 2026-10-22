// @vitest-environment jsdom

import { act, cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@posthog/react', () => ({
  usePostHog: () => ({ capture: vi.fn() }),
}))

const { SEARCH_DEBOUNCE_MS } = await import('@/gallery/gallery-search')
const { PAGE_SIZE } = await import('@/gallery/queries')
const {
  ENTRIES,
  pageLabels,
  renderGallery,
  searchBox,
  titles,
  typeAndWait,
  untilRendered,
  WEATHER,
} = await import('./home-gallery-router')

beforeEach(() => {
  window.scrollTo = vi.fn()
  Element.prototype.scrollIntoView = vi.fn()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('the home gallery search', () => {
  it('filters the list once typing pauses, from page 1, without loading anything again', async () => {
    const { router, loader } = await renderGallery('/?page=2')
    expect(pageLabels()).toEqual(['Page 2 of 3', 'Page 2 of 3'])
    vi.useFakeTimers()

    fireEvent.change(searchBox(), { target: { value: 'WEATHER' } })
    expect(searchBox().value).toBe('WEATHER')
    await act(() => vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS - 1))
    expect(router.state.location.search).toEqual({ page: 2 })
    expect(titles()).toContain('Git 0')

    await act(() => untilRendered(router, () => vi.advanceTimersByTimeAsync(1)))

    expect(router.state.location.search).toEqual({ q: 'WEATHER' })
    expect(titles()).toEqual(WEATHER.slice(0, PAGE_SIZE).map(({ item }) => item.card.title))
    expect(pageLabels()).toEqual(['Page 1 of 2', 'Page 1 of 2'])
    expect(loader).toHaveBeenCalledTimes(1)
  })

  it('keeps the search on the page links', async () => {
    const { router } = await renderGallery('/')
    vi.useFakeTimers()
    await typeAndWait(router, 'weather')

    for (const link of screen.getAllByRole('link', { name: 'Next page' })) {
      expect(link.getAttribute('href')).toBe('/?page=2&q=weather#gallery')
    }
  })

  it('keeps the search when the sort changes', async () => {
    const { router } = await renderGallery('/?q=weather')

    await act(() =>
      untilRendered(router, () => {
        fireEvent.click(screen.getByRole('radio', { name: 'New' }))
      }),
    )

    expect(router.state.location.search).toEqual({ sort: 'new', q: 'weather' })
    expect(searchBox().value).toBe('weather')
    expect(titles()).toHaveLength(PAGE_SIZE)
    expect(titles().every((title) => title?.startsWith('Weather'))).toBe(true)
  })

  it('says nothing matches, and clears the search back to the whole list', async () => {
    const { router, loader } = await renderGallery('/?q=nothing-like-this')
    expect(screen.getByText('Nothing matches “nothing-like-this”.')).toBeTruthy()
    expect(searchBox().value).toBe('nothing-like-this')
    expect(pageLabels()).toEqual([])

    await act(() =>
      untilRendered(router, () => {
        fireEvent.click(screen.getByRole('link', { name: 'Clear search' }))
      }),
    )

    expect(router.state.location.search).toEqual({})
    expect(searchBox().value).toBe('')
    expect(titles()).toHaveLength(PAGE_SIZE)
    expect(pageLabels()).toEqual(['Page 1 of 3', 'Page 1 of 3'])
    expect(loader).toHaveBeenCalledTimes(1)
  })

  it('shows the search from the URL when it changes elsewhere, as on going back', async () => {
    const { router } = await renderGallery('/')

    await act(() => untilRendered(router, () => router.navigate({ to: '/', search: { q: 'git' } })))

    expect(searchBox().value).toBe('git')
    expect(titles()).toEqual(ENTRIES.slice(PAGE_SIZE + 1).map(({ item }) => item.card.title))
  })

  it('reads a search that is not text (an array, an object) as no search, and shows the gallery', async () => {
    for (const url of ['/?q=%5B1%5D', '/?q=%7B%22a%22%3A1%7D']) {
      const { router } = await renderGallery(url)
      expect(router.state.location.search.q).toBeUndefined()
      expect(searchBox().value).toBe('')
      expect(titles()).toHaveLength(PAGE_SIZE)
      cleanup()
    }
  })

  it('works without JavaScript: a GET form to the home page that keeps the sort and filters', async () => {
    await renderGallery('/?sort=new&tags=git&kind=mods')
    const form = screen.getByRole('search')
    expect(form.getAttribute('method')).toBe('get')
    expect(form.getAttribute('action')).toBe('/')
    expect(searchBox().getAttribute('name')).toBe('q')
    expect(Object.fromEntries(new FormData(form as HTMLFormElement))).toEqual({
      sort: 'new',
      tags: 'git',
      kind: 'mods',
      q: '',
    })
  })
})
