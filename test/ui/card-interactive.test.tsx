// @vitest-environment jsdom
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Card } from '@/ui/card'

describe('Card interactive', () => {
  // The site's surfaces have no hairline: a card is a tone on the page, like the gallery rows.
  it('draws a card as one borderless surface', () => {
    const { container } = render(<Card>x</Card>)
    const el = container.querySelector('[data-slot=card]') as HTMLElement
    expect(el.className).not.toMatch(/\bring-1\b/)
    expect(el.className.split(/\s+/)).toContain('bg-card')
  })

  it('adds the gallery hover/entrance set when interactive', () => {
    const { container } = render(<Card interactive>x</Card>)
    const el = container.querySelector('[data-slot=card]') as HTMLElement
    for (const cls of [
      'animate-in',
      'fade-in',
      'slide-in-from-bottom-2',
      'relative',
      'transition-colors',
      'duration-150',
      'hover:bg-muted',
      // Full strength: with no hover ring left, this is the only focus indicator (WCAG 3:1).
      'focus-within:ring-2',
      'focus-within:ring-ring',
      'motion-reduce:animate-none',
    ]) {
      expect(el.className.split(/\s+/)).toContain(cls)
    }
  })

  it('omits the interactive set by default', () => {
    const { container } = render(<Card>x</Card>)
    const el = container.querySelector('[data-slot=card]') as HTMLElement
    expect(el.className).not.toContain('hover:-translate-y-0.5')
    expect(el.className).not.toContain('animate-in')
  })
})
