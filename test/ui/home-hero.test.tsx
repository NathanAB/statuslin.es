// @vitest-environment jsdom
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { HomeHero } from '@/ui/home-hero'

describe('HomeHero', () => {
  it('renders the brand wordmark with a coral dot', () => {
    const { container } = render(<HomeHero />)
    expect(container.textContent).toBe('statuslin.es')
    const dot = container.querySelector('[data-wordmark-dot]')
    expect(dot?.textContent).toBe('.')
    expect(dot?.className).toContain('text-primary')
  })

  it('is decoration, not a heading: the gallery intro owns the h1', () => {
    const { container } = render(<HomeHero />)
    expect(container.querySelectorAll('h1, h2, h3, [role="heading"]')).toHaveLength(0)
  })
})
