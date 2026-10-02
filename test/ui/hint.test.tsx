// @vitest-environment jsdom
import { render } from '@testing-library/react'
import { Monitor } from 'lucide-react'
import { describe, expect, it } from 'vitest'
import { Hint } from '@/ui/hint'

const classesOf = (el: Element | null) => el?.className.split(' ') ?? []

describe('Hint', () => {
  it('shows a decorative icon beside its text', () => {
    const { container } = render(
      <Hint icon={Monitor} variant="panel">
        Some text
      </Hint>,
    )
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
    expect(container.textContent).toBe('Some text')
  })

  it('renders the panel on the muted surface', () => {
    const { container } = render(
      <Hint icon={Monitor} variant="panel">
        Some text
      </Hint>,
    )
    expect(classesOf(container.firstElementChild)).toContain('bg-muted')
  })

  it('renders the strip as an outlined card-colored bar', () => {
    const { container } = render(
      <Hint icon={Monitor} variant="strip">
        Some text
      </Hint>,
    )
    expect(classesOf(container.firstElementChild)).toEqual(
      expect.arrayContaining(['border', 'border-border', 'bg-card']),
    )
  })
})
