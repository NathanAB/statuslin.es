// @vitest-environment jsdom
import { render } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { TerminalScreen } from '@/ui/terminal'

const MOTION = {
  conversationKey: 'c',
  conversationChanged: false,
  drawnKey: 'd',
  drawnChanged: false,
}

const renderAt = (at: 'above-prompt' | 'under-prompt' | 'side-pane', text: string) =>
  render(
    <TerminalScreen
      label="Claude Code"
      transcript={[{ kind: 'prompt', text: 'hi' }]}
      at={at}
      segments={[{ text }]}
      missing="Nothing"
      motion={MOTION}
    />,
  )

// A render wider than the screen used to lose its right edge. Its widest line, in characters, sets
// how small its text may go to fit.
describe('TerminalScreen', () => {
  it('fits a wide band to the screen by its widest line', () => {
    const { container } = renderAt('above-prompt', `${'x'.repeat(40)}\n${'y'.repeat(120)}`)
    const band = container.querySelector('[data-slot="terminal-band"] [data-fit]') as HTMLElement
    expect(band.style.getPropertyValue('--cols')).toBe('120')
  })

  // Sized after hydration, the text rendered full size and then shrank: a layout shift on every
  // load of the home page.
  it('sizes the text in the server render, before any script runs', () => {
    const html = renderToString(
      <TerminalScreen
        label="Claude Code"
        transcript={[{ kind: 'prompt', text: 'hi' }]}
        at="above-prompt"
        segments={[{ text: 'y'.repeat(120) }]}
        missing="Nothing"
        motion={MOTION}
      />,
    )
    expect(html).toContain('--cols:120')
  })

  // A pane stacked above the prompt was taller than the screen. Beside the conversation, its row
  // count sets how small its text goes to fit the screen's height.
  it('draws a side pane beside the conversation, fitted by its rows and widest line', () => {
    const { container } = renderAt('side-pane', `${'x'.repeat(49)}\nsrc\nlib`)
    const pane = container.querySelector('[data-slot="terminal-pane"]') as HTMLElement
    const fit = pane.querySelector('[data-fit]') as HTMLElement
    expect(pane.textContent).toContain('src')
    expect(fit.style.getPropertyValue('--rows')).toBe('3')
    expect(fit.style.getPropertyValue('--cols')).toBe('49')
    expect(container.querySelector('[data-slot="terminal-band"]')).toBeNull()
    expect(container.querySelector('[data-slot="terminal-status"]')).toBeNull()
    // The conversation and the prompt sit in the column before the pane, not inside it.
    const before = pane.previousElementSibling as HTMLElement
    expect(before.textContent).toContain('hi')
    expect(pane.textContent).not.toContain('hi')
  })

  it('fits the status line row the same way', () => {
    const { container } = renderAt('under-prompt', 'z'.repeat(96))
    const row = container.querySelector('[data-slot="terminal-status"] [data-fit]') as HTMLElement
    expect(row.style.getPropertyValue('--cols')).toBe('96')
  })
})
