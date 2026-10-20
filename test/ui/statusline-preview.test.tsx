// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StatuslinePreview } from '@/ui/statusline-preview'

const LINE = [{ text: 'Opus 4.8 ~/app main | 22% | 5h 26% | 7d 7% | $0.41' }]

// jsdom lays nothing out: give every scroller a width and the line inside it a wider one.
function overflowing(lineWidth: number, boxWidth = 300) {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(boxWidth)
  vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(lineWidth)
}

afterEach(() => vi.restoreAllMocks())

// A cropped strip gave no sign there was more; on a phone most lines are cut off.
describe('StatuslinePreview strip', () => {
  it('offers a scroll button when the line is wider than its strip, and scrolls on press', () => {
    overflowing(700)
    const scrollBy = vi.fn()
    HTMLElement.prototype.scrollBy = scrollBy
    render(<StatuslinePreview segments={LINE} look="strip" />)

    fireEvent.click(screen.getByRole('button', { name: 'Show more of this status line' }))
    expect(scrollBy).toHaveBeenCalledWith(expect.objectContaining({ left: expect.any(Number) }))
  })

  // Removing the button at the end dropped keyboard focus to the page; it stays, marked unavailable.
  it('keeps the button once scrolled to the end, marked unavailable, so focus stays on it', () => {
    overflowing(700)
    vi.spyOn(HTMLElement.prototype, 'scrollLeft', 'get').mockReturnValue(400)
    render(<StatuslinePreview segments={LINE} look="strip" />)

    expect(
      screen
        .getByRole('button', { name: 'Show more of this status line' })
        .getAttribute('aria-disabled'),
    ).toBe('true')
  })

  it('shows no button when the whole line fits', () => {
    overflowing(280)
    render(<StatuslinePreview segments={LINE} look="strip" />)

    expect(screen.queryByRole('button')).toBeNull()
  })
})
