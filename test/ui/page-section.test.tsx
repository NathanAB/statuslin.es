// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PageSection } from '@/ui/page-section'

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
})
