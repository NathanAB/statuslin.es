// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FaqSection } from '@/ui/faq-section'

describe('FaqSection', () => {
  it('breaks a long URL in an answer so it wraps on a phone', () => {
    render(
      <FaqSection
        entries={[
          {
            question: 'How?',
            answer: 'Run `claude plugin marketplace add https://example.com/x.json`.',
          },
        ]}
      />,
    )
    const answer = screen.getByText('claude plugin marketplace add https://example.com/x.json')
      .parentElement as HTMLElement
    expect(answer.className.split(' ')).toContain('wrap-anywhere')
  })
})
