// @vitest-environment jsdom
import { act, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
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

const SPY_CONTENTS = [
  { id: 'one', title: 'One' },
  { id: 'two', title: 'Two', children: [{ id: 'two-a', title: 'Two A' }] },
  { id: 'three', title: 'Three' },
]

// Where each section's top sits in the window, as the reader scrolls.
let tops: Record<string, number> = {}

function renderDoc() {
  // A section's top is wherever the test has scrolled it; jsdom lays nothing out.
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    return { top: tops[this.id] ?? 0, height: 0 } as DOMRect
  })
  render(
    <DocLayout intro={<h1>Guide</h1>} contents={SPY_CONTENTS}>
      {['one', 'two', 'two-a', 'three'].map((id) => (
        <section key={id} id={id}>
          {id}
        </section>
      ))}
    </DocLayout>,
  )
}

function scrollTo(next: Record<string, number>) {
  tops = next
  act(() => {
    window.dispatchEvent(new Event('scroll'))
  })
}

const current = () =>
  screen
    .getAllByRole('link')
    .filter((link) => link.getAttribute('aria-current'))
    .map((link) => link.textContent)

afterEach(() => {
  tops = {}
  vi.restoreAllMocks()
})

describe('DocLayout contents', () => {
  it('marks the section being read as the current one, and follows the scroll', async () => {
    tops = { one: 40, two: 900, 'two-a': 1300, three: 2000 }
    renderDoc()
    expect(current()).toEqual(['One'])
    expect(screen.getByRole('link', { name: 'One' }).getAttribute('aria-current')).toBe('location')

    scrollTo({ one: -900, two: -200, 'two-a': 60, three: 300 })
    await waitFor(() => expect(current()).toEqual(['Two A']))
  })

  it('marks none while the reader is still in the intro', () => {
    tops = { one: 2000, two: 2900, 'two-a': 3300, three: 4000 }
    renderDoc()
    expect(current()).toEqual([])
  })
})
