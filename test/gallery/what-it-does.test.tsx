// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import { Globe } from 'lucide-react'
import { describe, expect, it } from 'vitest'
import { WhatItDoes } from '@/gallery/what-it-does'

const COPY = {
  summary: 'Shows the git branch and how full the context window is.',
  howItWorks: ['Reads the session JSON on stdin', 'Runs `git` for the branch'],
  goodToKnow: ['Needs `jq` on your PATH'],
}
const TILES = [{ icon: Globe, label: 'Network', value: 'None' }]

/** The card's content, found from its h2. */
function card() {
  const heading = screen.getByRole('heading', { level: 2, name: 'What it does' })
  const element = heading.closest('section')
  if (!(element instanceof HTMLElement)) throw new Error('no card around What it does')
  return within(element)
}

const inOrder = (nodes: Node[]) =>
  nodes.every(
    (node, i) =>
      i === 0 ||
      Boolean(
        (nodes[i - 1] as Node).compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING,
      ),
  )

describe('WhatItDoes', () => {
  it('runs the summary, the fact tiles, the steps, then the notes, in one titled card', () => {
    render(<WhatItDoes copy={COPY} tiles={TILES} />)

    const what = card()
    expect(
      inOrder([
        what.getByText(COPY.summary),
        what.getByText('Network'),
        what.getByRole('heading', { level: 3, name: 'How it works' }),
        what.getByRole('heading', { level: 3, name: 'Good to know' }),
      ]),
    ).toBe(true)
  })

  it('numbers the steps and lists the notes', () => {
    const { container } = render(<WhatItDoes copy={COPY} tiles={TILES} />)

    expect([...container.querySelectorAll('ol > li')].map((li) => li.textContent)).toEqual([
      'Reads the session JSON on stdin',
      'Runs git for the branch',
    ])
    expect([...container.querySelectorAll('ul > li')].map((li) => li.textContent)).toEqual([
      'Needs jq on your PATH',
    ])
  })

  it('leaves out a steps or notes section with nothing in it', () => {
    render(<WhatItDoes copy={{ ...COPY, howItWorks: [], goodToKnow: [] }} tiles={TILES} />)

    expect(screen.queryByRole('heading', { name: 'How it works' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Good to know' })).toBeNull()
  })

  it('still states the facts when no page copy has been generated', () => {
    render(<WhatItDoes copy={null} tiles={TILES} />)

    expect(card().getByText('Network')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'How it works' })).toBeNull()
  })
})
