// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { Globe } from 'lucide-react'
import { describe, expect, it } from 'vitest'
import { FactLine } from '@/ui/fact-line'

describe('FactLine', () => {
  // A host inside a risk fact was drawn in white, so "Calls" was amber and the host it calls wasn't.
  it('keeps code inside a risk fact in the caution tint', () => {
    render(
      <FactLine
        label="What it can reach"
        facts={[{ icon: Globe, text: 'Calls `wttr.in`', caution: true }]}
      />,
    )
    expect(screen.getByText('wttr.in').className).not.toMatch(/\btext-foreground\b/)
  })
})
