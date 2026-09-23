// @vitest-environment jsdom
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { InlineCodeText } from '@/ui/inline-code-text'

describe('InlineCodeText', () => {
  it('renders backtick-marked spans in monospace and drops the backticks', () => {
    const { container } = render(
      <InlineCodeText text="Read `context_window.used_percentage` first." />,
    )
    expect(container.textContent).toBe('Read context_window.used_percentage first.')
    expect([...container.querySelectorAll('.font-mono')].map((n) => n.textContent)).toEqual([
      'context_window.used_percentage',
    ])
  })
})
