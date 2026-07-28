// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { HOME_HEADING_BASE } from '@/lib/page-title'
import { HomeHero } from '@/ui/home-hero'

describe('HomeHero', () => {
  it('renders the shared wordmark with a coral dot', () => {
    const { container } = render(<HomeHero />)
    expect(container.textContent).toContain('statuslin.es')
    const dot = container.querySelector('[data-wordmark-dot]')
    expect(dot?.textContent).toBe('.')
    expect(dot?.className).toContain('text-primary')
  })

  it('renders one h1 that separates the wordmark from the keyword phrase', () => {
    const { container } = render(<HomeHero />)
    const h1s = container.querySelectorAll('h1')
    expect(h1s).toHaveLength(1)
    // Exact text, not toContain: JSX drops whitespace between sibling elements, so without an
    // explicit separator this reads "statuslin.esClaude Code status line examples" to anything that
    // walks text nodes — a screen reader announcing the heading, or a crawler.
    expect(h1s[0]?.textContent).toBe(`statuslin.es ${HOME_HEADING_BASE}`)
  })

  it('shows the keyword phrase to sighted readers instead of hiding it', () => {
    const { container } = render(<HomeHero />)
    // The phrase used to live in an sr-only span, which rendered at 1x1px: real text for
    // crawlers, invisible to readers. It is the visible hero subtitle now, so nothing in
    // the hero may be screen-reader-only.
    expect(container.querySelector('.sr-only')).toBeNull()
    const subtitle = screen.getByText(HOME_HEADING_BASE)
    expect(subtitle.className).not.toContain('sr-only')
    expect(subtitle.className).toContain('text-muted-foreground')
  })

  it('adds the loader-clamped page number to the page 2 heading', () => {
    render(<HomeHero page={2} />)

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'statuslin.es Claude Code status line examples — Page 2',
      }),
    ).toBeTruthy()
  })
})
