// @vitest-environment jsdom
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CodeBlock } from '@/ui/code-block'

describe('CodeBlock', () => {
  it('scrolls long lines by default', () => {
    const { container } = render(<CodeBlock>echo hi</CodeBlock>)
    const classes = container.querySelector('pre')?.className.split(' ') ?? []
    expect(classes).toContain('overflow-x-auto')
    expect(classes).not.toContain('whitespace-pre-wrap')
  })

  it('wraps long lines clear of the copy control when asked', () => {
    const { container } = render(
      <CodeBlock wrap text="echo hi" copyLabel="Copy">
        echo hi
      </CodeBlock>,
    )
    const classes = container.querySelector('pre')?.className.split(' ') ?? []
    expect(classes).toEqual(
      expect.arrayContaining(['whitespace-pre-wrap', 'wrap-anywhere', 'pr-12']),
    )
  })
})
