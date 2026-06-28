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
})
