// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Details } from '@/ui/details'

describe('Details', () => {
  it('renders a details element with a summary and children', () => {
    const { container } = render(
      <Details summary="Source">
        <pre>code here</pre>
      </Details>,
    )
    expect(container.querySelector('details')).not.toBeNull()
    expect(screen.getByText('Source')).toBeTruthy()
    expect(screen.getByText('code here')).toBeTruthy()
  })

  it('applies cursor-pointer to the summary', () => {
    const { container } = render(
      <Details summary="Source">
        <pre>x</pre>
      </Details>,
    )
    const summary = container.querySelector('summary') as HTMLElement
    expect(summary.className).toContain('cursor-pointer')
  })

  it('applies muted + small styling to the summary label', () => {
    const { container } = render(
      <Details summary="Source">
        <pre>x</pre>
      </Details>,
    )
    const summary = container.querySelector('summary') as HTMLElement
    expect(summary.className).toContain('text-muted-foreground')
    expect(summary.className).toContain('text-sm')
  })
})
