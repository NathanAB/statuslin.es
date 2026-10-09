// @vitest-environment jsdom
import { render } from '@testing-library/react'
import { Monitor } from 'lucide-react'
import { describe, expect, it } from 'vitest'
import { Hint } from '@/ui/hint'

describe('Hint', () => {
  it('shows a decorative icon beside its text', () => {
    const { container } = render(<Hint icon={Monitor}>Some text</Hint>)
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
    expect(container.textContent).toBe('Some text')
  })

  it('renders as an outlined card-colored strip', () => {
    const { container } = render(<Hint icon={Monitor}>Some text</Hint>)
    expect(container.firstElementChild?.className.split(' ')).toEqual(
      expect.arrayContaining(['border', 'border-border', 'bg-card']),
    )
  })

  it('puts an action after its text, inside the same strip', () => {
    const { container } = render(
      <Hint icon={Monitor} action={<button type="button">Act</button>}>
        Some text
      </Hint>,
    )
    const strip = container.firstElementChild
    expect(strip?.className.split(' ')).toEqual(expect.arrayContaining(['border', 'bg-card']))
    expect(strip?.lastElementChild?.innerHTML).toBe('<button type="button">Act</button>')
    expect(container.textContent).toBe('Some textAct')
  })
})
