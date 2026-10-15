// @vitest-environment jsdom
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { BulletList } from '@/ui/bullet-list'

describe('BulletList', () => {
  it('renders each item as an li inside a ul', () => {
    const { container } = render(<BulletList items={['Current git branch', 'Model name']} />)
    const items = container.querySelectorAll('ul > li')
    expect(items).toHaveLength(2)
    expect(items[0]?.textContent).toBe('Current git branch')
    expect(items[1]?.textContent).toBe('Model name')
  })

  it('shows backtick-marked code in monospace', () => {
    const { container } = render(<BulletList items={['Needs `jq` on your PATH']} />)
    expect(container.querySelector('li')?.textContent).toBe('Needs jq on your PATH')
    expect(container.querySelector('.font-mono')?.textContent).toBe('jq')
  })

  it('renders duplicate items as separate list entries', () => {
    const { container } = render(<BulletList items={['bash', 'bash']} />)
    const items = container.querySelectorAll('ul > li')
    expect(items).toHaveLength(2)
  })
})
