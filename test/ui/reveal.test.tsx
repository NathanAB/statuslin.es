// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Reveal } from '@/ui/reveal'

// jsdom has no layout, so the test says where the block sits, then scrolls.
let top = 2000
const realMatchMedia = window.matchMedia

beforeEach(() => {
  top = 2000
  // The next frame, a moment after the scroll, as in a browser.
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    void Promise.resolve().then(() => callback(0))
    return 1
  })
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    () => ({ top }) as DOMRect,
  )
  window.matchMedia = ((query: string) => ({ matches: false, media: query })) as never
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  window.matchMedia = realMatchMedia
})

const block = () => screen.getByText('Below the fold')
const scrollTo = (blockTop: number) =>
  act(async () => {
    top = blockTop
    window.dispatchEvent(new Event('scroll'))
    await Promise.resolve()
  })

describe('Reveal', () => {
  it('is visible in the server HTML, so nothing is hidden without JavaScript', () => {
    expect(renderToString(<Reveal>Below the fold</Reveal>)).not.toContain('data-reveal')
  })

  it('rises into view when a block below the fold scrolls in', async () => {
    render(<Reveal>Below the fold</Reveal>)
    expect(block().getAttribute('data-reveal')).toBe('waiting')

    await scrollTo(1500)
    expect(block().getAttribute('data-reveal')).toBe('waiting')
    await scrollTo(300)
    expect(block().getAttribute('data-reveal')).toBe('shown')
  })

  // The End key or a link to a section further down can jump right past a block.
  it('shows a block the page jumped past', async () => {
    render(<Reveal>Below the fold</Reveal>)

    await scrollTo(-4000)

    expect(block().getAttribute('data-reveal')).toBe('shown')
  })

  it('leaves a block that starts on screen alone', () => {
    top = 100
    render(<Reveal>Below the fold</Reveal>)
    expect(block().hasAttribute('data-reveal')).toBe(false)
  })

  it('never hides anything for a visitor who asks for less motion', () => {
    window.matchMedia = ((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
    })) as never
    render(<Reveal>Below the fold</Reveal>)
    expect(block().hasAttribute('data-reveal')).toBe(false)
  })
})
