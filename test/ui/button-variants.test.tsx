// @vitest-environment jsdom
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Button } from '@/ui/button'

describe('Button active variant', () => {
  it('adds the active-tab classes when active is set', () => {
    const { container } = render(
      <Button variant="outline" active>
        Top
      </Button>,
    )
    const el = container.querySelector('[data-slot=button]') as HTMLElement
    expect(el.className).toContain('border-primary/50')
    expect(el.className).toContain('text-foreground')
  })

  it('omits the active classes by default', () => {
    const { container } = render(<Button variant="outline">Top</Button>)
    const el = container.querySelector('[data-slot=button]') as HTMLElement
    expect(el.className).not.toContain('border-primary/50')
  })
})

describe('Button trigger size', () => {
  it('uses the header-trigger dimensions', () => {
    const { container } = render(
      <Button variant="ghost" size="trigger">
        @ada
      </Button>,
    )
    const el = container.querySelector('[data-slot=button]') as HTMLElement
    expect(el.className).toContain('h-9')
    expect(el.className).toContain('gap-2')
    expect(el.className).toContain('px-3')
  })
})
