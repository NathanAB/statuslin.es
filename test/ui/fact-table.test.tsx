// @vitest-environment jsdom
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { FactTable } from '@/ui/fact-table'

describe('FactTable', () => {
  it('renders one column per subject and one labelled row per attribute', () => {
    const { container } = render(
      <FactTable
        columns={['ccstatusline', 'claude-powerline']}
        rows={[
          { label: 'Setup', cells: ['Interactive terminal UI', 'JSON file'] },
          { label: 'Usage limits', cells: ['Yes', 'Yes'] },
        ]}
      />,
    )
    const headers = [...container.querySelectorAll('thead th')].map((th) => th.textContent)
    expect(headers).toEqual(['Attribute', 'ccstatusline', 'claude-powerline'])
    const rows = [...container.querySelectorAll('tbody tr')].map((tr) =>
      [...tr.children].map((cell) => `${cell.tagName}:${cell.textContent}`),
    )
    expect(rows).toEqual([
      ['TH:Setup', 'TD:Interactive terminal UI', 'TD:JSON file'],
      ['TH:Usage limits', 'TD:Yes', 'TD:Yes'],
    ])
  })
})
