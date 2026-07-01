// @vitest-environment jsdom
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { HomeHero } from '@/ui/home-hero'

describe('HomeHero', () => {
  it('renders the shared wordmark with a coral dot', () => {
    const { container } = render(<HomeHero />)
    expect(container.textContent).toContain('statuslin.es')
    const dot = container.querySelector('[data-wordmark-dot]')
    expect(dot?.textContent).toBe('.')
    expect(dot?.className).toContain('text-primary')
  })

  it('renders an h1 that still shows the wordmark and adds the keyword for crawlers', () => {
    const { container } = render(<HomeHero />)
    const h1 = container.querySelector('h1')
    expect(h1).not.toBeNull()
    // Visible wordmark is preserved...
    expect(h1?.textContent).toContain('statuslin.es')
    // ...and the keyword phrase is present in the heading's text.
    expect(h1?.textContent).toContain('Claude Code status lines')
  })

  it('keeps the keyword phrase in an sr-only element', () => {
    const { container } = render(<HomeHero />)
    const srOnly = container.querySelector('.sr-only')
    expect(srOnly?.textContent).toBe('Claude Code status lines')
  })
})
