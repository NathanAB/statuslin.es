// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DocLayout } from '@/ui/doc-layout'

const CONTENTS = [
  { id: 'setup', title: 'Setup', children: [{ id: 'install', title: 'Install' }] },
  { id: 'faq', title: 'FAQ' },
]

// A long page with a contents list: it sits beside the text on a wide screen and under the intro
// on a narrow one, so a reader meets the title first and the contents right after.
describe('DocLayout', () => {
  it('reads intro, then the contents list, then the body', () => {
    render(
      <DocLayout intro={<h1>Guide</h1>} contents={CONTENTS}>
        <p>body</p>
      </DocLayout>,
    )

    const intro = screen.getByRole('heading', { level: 1, name: 'Guide' })
    const nav = screen.getByRole('navigation', { name: 'On this page' })
    const body = screen.getByText('body')
    expect(intro.compareDocumentPosition(nav) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(nav.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('links each entry to its section, nested entries under their parent', () => {
    render(
      <DocLayout intro={<h1>Guide</h1>} contents={CONTENTS}>
        <p>body</p>
      </DocLayout>,
    )

    const nav = screen.getByRole('navigation', { name: 'On this page' })
    const hrefs = within(nav)
      .getAllByRole('link')
      .map((link) => [link.textContent, link.getAttribute('href')])
    expect(hrefs).toEqual([
      ['Setup', '#setup'],
      ['Install', '#install'],
      ['FAQ', '#faq'],
    ])
    const setup = within(nav).getByRole('link', { name: 'Setup' }).closest('li')
    expect(setup && within(setup).getByRole('link', { name: 'Install' })).toBeTruthy()
  })
})
