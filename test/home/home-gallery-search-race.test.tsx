// @vitest-environment jsdom

import { act, fireEvent, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@posthog/react', () => ({
  usePostHog: () => ({ capture: vi.fn() }),
}))

const { SEARCH_DEBOUNCE_MS } = await import('@/gallery/gallery-search')
const { renderGallery, searchBox, untilRendered } = await import('./home-gallery-router')

beforeEach(() => {
  window.scrollTo = vi.fn()
  Element.prototype.scrollIntoView = vi.fn()
})
afterEach(() => {
  vi.useRealTimers()
})

const type = (text: string) => fireEvent.change(searchBox(), { target: { value: text } })

describe('the gallery search box against a change from outside it', () => {
  it('lets Clear search win over a search still waiting to apply', async () => {
    const { router } = await renderGallery('/?q=zzzz')
    vi.useFakeTimers()

    type('zzzzq')
    await act(() =>
      untilRendered(router, () => {
        fireEvent.click(screen.getByRole('link', { name: 'Clear search' }))
      }),
    )
    await act(() => vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS))

    expect(router.state.location.search).toEqual({})
    expect(searchBox().value).toBe('')
  })

  it('lets Back win over a search still waiting to apply', async () => {
    const { router } = await renderGallery('/', '/?q=zzzz')
    vi.useFakeTimers()

    type('zzzzq')
    await act(() => untilRendered(router, () => router.history.back()))
    await act(() => vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS))

    expect(router.state.location.search).toEqual({})
    expect(searchBox().value).toBe('')
  })

  it("keeps the newer text when the box's own search lands while the visitor types on", async () => {
    const { router } = await renderGallery('/')
    vi.useFakeTimers()

    type('we')
    await act(() =>
      untilRendered(router, () => {
        vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS)
        type('weat')
      }),
    )
    expect(router.state.location.search).toEqual({ q: 'we' })
    expect(searchBox().value).toBe('weat')

    await act(() => untilRendered(router, () => vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS)))
    expect(router.state.location.search).toEqual({ q: 'weat' })
    expect(searchBox().value).toBe('weat')
  })
})
