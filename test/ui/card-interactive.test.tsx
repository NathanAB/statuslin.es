// @vitest-environment jsdom
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Card } from '@/ui/card'

describe('Card interactive', () => {
  it('adds the gallery hover/entrance set when interactive', () => {
    const { container } = render(<Card interactive>x</Card>)
    const el = container.querySelector('[data-slot=card]') as HTMLElement
    for (const cls of [
      'animate-in',
      'fade-in',
      'slide-in-from-bottom-2',
      'relative',
      'transition-all',
      'duration-150',
      'hover:ring-3',
      'hover:ring-primary/40',
      'focus-within:ring-3',
      'focus-within:ring-primary/40',
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
