// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ThemePreview } from '@/ui/theme-preview'

// A recorded screen: text the theme colored, and default-colored text (no fg or bg) around it.
const SCREEN = [
  { text: '╭─ Claude Code ─╮', fg: 'rgb(215, 119, 87)' },
  { text: '\n> hello' },
  { text: '\n', bg: null, fg: null },
  { text: 'x'.repeat(100) },
]

const windowOf = (name: string) => screen.getByRole('img', { name })

describe('ThemePreview', () => {
  // Default-colored text takes the terminal's own colors, so a light theme drawn in the site's dark
  // well would put its dark text on near-black.
  it('draws a light theme in a light window and a dark theme in a dark one', () => {
    render(
      <>
        <ThemePreview segments={SCREEN} window="light" label="Paper" />
        <ThemePreview segments={SCREEN} window="dark" label="Night" />
      </>,
    )

    expect(windowOf('Paper').className).toContain('bg-foreground')
    expect(windowOf('Paper').className).toContain('text-background')
    expect(windowOf('Night').className).toContain('bg-sunken')
    expect(windowOf('Night').className).not.toContain('bg-foreground')
  })

  it("leaves default-colored text to the window's colors and keeps the theme's own", () => {
    render(<ThemePreview segments={SCREEN} window="light" label="Paper" />)

    const plain = screen.getByText('> hello', { exact: false })
    expect(plain.style.color).toBe('')
    expect(plain.style.background).toBe('')
    expect(screen.getByText('╭─ Claude Code ─╮').getAttribute('style')).toContain(
      'color: rgb(215, 119, 87)',
    )
  })

  it('sizes the text from the widest row, so the whole screen fits the card', () => {
    render(<ThemePreview segments={SCREEN} window="dark" label="Night" />)

    const fitted = windowOf('Night').querySelector('[data-fit]') as HTMLElement
    expect(fitted.style.getPropertyValue('--cols')).toBe('100')
    expect(fitted.style.getPropertyValue('--rows')).toBe('3')
  })
})
