// @vitest-environment jsdom
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { NumberedList } from '@/ui/numbered-list'

describe('NumberedList', () => {
  it('renders each step as an li inside an ol, in order', () => {
    const { container } = render(<NumberedList items={['Install it', 'Run `/burn`']} />)

    const items = [...container.querySelectorAll('ol > li')].map((li) => li.textContent)
    expect(items).toEqual(['Install it', 'Run /burn'])
  })

  it('shows backtick-marked code in monospace', () => {
    const { container } = render(<NumberedList items={['Run `/burn`']} />)

    expect(container.querySelector('.font-mono')?.textContent).toBe('/burn')
  })
})
