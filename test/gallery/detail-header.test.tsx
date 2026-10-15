// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}))

const { DetailHeader } = await import('@/gallery/detail-header')

const BYLINE = {
  author: { name: 'Octo Cat', username: 'octocat', image: 'https://example.com/octocat.png' },
  source: null,
  license: 'MIT licensed',
}

function follows(earlier: Node, later: Node): boolean {
  return Boolean(earlier.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING)
}

describe('DetailHeader', () => {
  it('stacks the breadcrumb, the title with its chips, the byline, then the description', () => {
    render(
      <DetailHeader
        trail={[]}
        title="Powerline Dracula"
        chips={<span>chip</span>}
        byline={BYLINE}
        description="A Powerline-style status line."
      />,
    )

    const order = [
      screen.getByRole('navigation', { name: 'Breadcrumb' }),
      screen.getByRole('heading', { level: 1, name: 'Powerline Dracula' }),
      screen.getByText('chip'),
      screen.getByText('by'),
      screen.getByText('A Powerline-style status line.'),
    ]
    for (let i = 1; i < order.length; i++) {
      expect(follows(order[i - 1] as Node, order[i] as Node)).toBe(true)
    }
  })

  it('leaves out an empty description', () => {
    const { container } = render(
      <DetailHeader trail={[]} title="Solo" byline={BYLINE} description="" />,
    )

    expect(container.textContent).toBe('Status lines›SoloSoloby@octocat·MIT licensed')
    expect([...container.querySelectorAll('p')].filter((p) => p.textContent === '')).toEqual([])
  })
})
