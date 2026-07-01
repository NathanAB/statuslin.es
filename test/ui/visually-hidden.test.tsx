// @vitest-environment jsdom
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { VisuallyHidden } from '@/ui/visually-hidden'

describe('VisuallyHidden', () => {
  it('renders a span with the sr-only class by default', () => {
    const { container } = render(<VisuallyHidden>Claude Code status lines</VisuallyHidden>)
    const el = container.firstChild as HTMLElement
    expect(el.tagName).toBe('SPAN')
    expect(el.textContent).toBe('Claude Code status lines')
    expect(el.className).toContain('sr-only')
  })

  it('renders the requested tag when `as` is set', () => {
    const { container } = render(<VisuallyHidden as="h2">Status lines</VisuallyHidden>)
    const el = container.firstChild as HTMLElement
    expect(el.tagName).toBe('H2')
    expect(el.textContent).toBe('Status lines')
    expect(el.className).toContain('sr-only')
  })
})
