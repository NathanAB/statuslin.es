// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PageSection, SectionAnchor } from '@/ui/page-section'

// A section of a public page is its heading on the page, not a box: boxes sit one level deep.
describe('PageSection', () => {
  it('is a region named by its h2, with no card around it', () => {
    const { container } = render(
      <PageSection title="Preview">
        <p>rows</p>
      </PageSection>,
    )

    const region = screen.getByRole('region', { name: 'Preview' })
    expect(within(region).getByRole('heading', { level: 2, name: 'Preview' })).toBeTruthy()
    expect(within(region).getByText('rows')).toBeTruthy()
    expect(container.querySelector('[data-slot="card"]')).toBeNull()
  })

  // A link like /guide#preview lands on the section, so its id is the one it was given.
  it('takes an anchor id that a link can land on, and stays named by its h2', () => {
    render(
      <PageSection title="Preview" id="preview">
        <p>rows</p>
      </PageSection>,
    )

    const region = screen.getByRole('region', { name: 'Preview' })
    expect(region.id).toBe('preview')
  })
})

// A section whose heading another component draws (the FAQ) still needs somewhere to land.
describe('SectionAnchor', () => {
  it('gives the content inside it an id a link can land on', () => {
    const { container } = render(
      <SectionAnchor id="common-questions">
        <h2>Common questions</h2>
      </SectionAnchor>,
    )

    const anchor = container.querySelector('#common-questions')
    expect(anchor?.textContent).toBe('Common questions')
  })
})
