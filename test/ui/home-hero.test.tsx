// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { HOME_HEADING_BASE } from '@/lib/page-title'
import { HomeHero } from '@/ui/home-hero'

describe('HomeHero', () => {
  it('renders the brand wordmark with a coral dot', () => {
    const { container } = render(<HomeHero />)
    expect(container.textContent).toContain('statuslin.es')
    const dot = container.querySelector('[data-wordmark-dot]')
    expect(dot?.textContent).toBe('.')
    expect(dot?.className).toContain('text-primary')
  })

  it('renders one h1 that is the wordmark, without repeating the search phrase', () => {
    const { container } = render(<HomeHero />)
    const h1s = container.querySelectorAll('h1')
    expect(h1s).toHaveLength(1)
    expect(h1s[0]?.textContent).toBe('statuslin.es')
    expect(h1s[0]?.textContent).not.toContain(HOME_HEADING_BASE)
  })

  it('left-aligns the title so it can sit beside the gallery intro', () => {
    const { container } = render(<HomeHero />)
    const h1 = container.querySelector('h1')
    expect(h1?.className).not.toContain('text-center')
  })

  it('adds the loader-clamped page number to the page 2 heading', () => {
    render(<HomeHero page={2} />)

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'statuslin.es Page 2',
      }),
    ).toBeTruthy()
  })
})
