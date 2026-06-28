// @vitest-environment jsdom
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Textarea } from '@/ui/textarea'

describe('Textarea', () => {
  it('renders a textarea element', () => {
    const { container } = render(<Textarea />)
    expect(container.querySelector('textarea')).not.toBeNull()
  })

  it('does NOT apply font-mono by default', () => {
    const { container } = render(<Textarea />)
    const el = container.querySelector('textarea') as HTMLElement
    expect(el.className).not.toContain('font-mono')
  })

  it('applies font-mono when mono prop is set', () => {
    const { container } = render(<Textarea mono />)
    const el = container.querySelector('textarea') as HTMLElement
    expect(el.className).toContain('font-mono')
  })
})
