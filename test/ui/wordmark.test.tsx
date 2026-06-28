// @vitest-environment jsdom
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Wordmark } from '@/ui/wordmark'

describe('Wordmark', () => {
  it('renders statuslin + a coral dot + es', () => {
    const { container } = render(<Wordmark />)
    expect(container.textContent).toBe('statuslin.es')
    // The dot is a separate element carrying the primary (coral) color token.
    const dot = container.querySelector('[data-wordmark-dot]')
    expect(dot?.textContent).toBe('.')
    expect(dot?.className).toContain('text-primary')
  })
  it('uses the monospace family', () => {
    const { container } = render(<Wordmark />)
    expect((container.firstChild as HTMLElement).className).toContain('font-mono')
  })
})
