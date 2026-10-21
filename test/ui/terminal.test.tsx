// @vitest-environment jsdom
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TerminalScreen } from '@/ui/terminal'

const MOTION = {
  conversationKey: 'c',
  conversationChanged: false,
  drawnKey: 'd',
  drawnChanged: false,
}

const renderAt = (at: 'above-prompt' | 'under-prompt', text: string) =>
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

  it('fits the status line row the same way', () => {
    const { container } = renderAt('under-prompt', 'z'.repeat(96))
    const row = container.querySelector('[data-slot="terminal-status"] [data-fit]') as HTMLElement
    expect(row.style.getPropertyValue('--cols')).toBe('96')
  })
})
