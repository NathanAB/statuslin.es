// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { LinkRows } from '@/ui/link-rows'

// A list of outside resources: each row its name, what it is, and a small note beside the name.
describe('LinkRows', () => {
  it('lists each row with its name as a heading, its description and its note', () => {
    render(
      <LinkRows
        items={[
          {
            key: 'a',
            title: <a href="https://a.example">Alpha</a>,
            meta: 'a.example',
            description: 'The first tool, which does one thing.',
          },
          { key: 'b', title: 'Beta', description: 'The second tool, which does another.' },
        ]}
      />,
    )
    const rows = within(screen.getByRole('list')).getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(within(rows[0] as HTMLElement).getByRole('heading', { level: 3, name: 'Alpha' }))
    expect(rows[0]?.textContent).toContain('The first tool, which does one thing.')
    expect(rows[0]?.textContent).toContain('a.example')
    expect(within(rows[1] as HTMLElement).getByRole('heading', { level: 3, name: 'Beta' }))
  })
})
