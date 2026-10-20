// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { Globe } from 'lucide-react'
import { describe, expect, it } from 'vitest'
import { FactSentence } from '@/ui/fact-sentence'

describe('FactSentence', () => {
  it('names its subject, then says the fact', () => {
    const { container } = render(
      <FactSentence
        subject="Meter"
        fact={{ icon: Globe, text: "doesn't connect to the internet." }}
      />,
    )
    expect(container.textContent).toBe("Meter doesn't connect to the internet.")
  })

  // A host inside a risk fact was drawn in white, so "connects to" was amber and the host wasn't.
  it('keeps code inside a risk fact in the caution tint', () => {
    render(
      <FactSentence
        subject="Meter"
        fact={{ icon: Globe, text: 'connects to `wttr.in`.', caution: true }}
      />,
    )
    expect(screen.getByText('wttr.in').className).not.toMatch(/\btext-foreground\b/)
  })
})
