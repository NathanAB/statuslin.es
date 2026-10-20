// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import { Globe } from 'lucide-react'
import { describe, expect, it } from 'vitest'

import { DetailPageLayout } from '@/gallery/detail-page-layout'

const WHAT_IT_DOES = {
  copy: { summary: 'Shows the git branch.', howItWorks: ['Runs git'], goodToKnow: [] },
  tiles: [{ icon: Globe, label: 'Network', value: 'None' }],
}

function renderLayout(overrides: Partial<Parameters<typeof DetailPageLayout>[0]> = {}) {
  return render(
    <DetailPageLayout
      notice={<p>notice</p>}
      header={<h1>header</h1>}
      install={<p>install</p>}
      beforeInstall={<p>before you install</p>}
      preview={<p>preview</p>}
      whatItDoes={WHAT_IT_DOES}
      source={<p>source</p>}
      related={<p>related</p>}
      {...overrides}
    />,
  )
}

/** The section whose h2 is `title`. */
function section(title: string) {
  return within(screen.getByRole('region', { name: title }))
}

describe('DetailPageLayout', () => {
  it('runs notice, header, install, preview, what it does, source, then related', () => {
    renderLayout()

    const order = [
      screen.getByText('notice'),
      screen.getByText('header'),
      screen.getByText('install'),
      screen.getByText('before you install'),
      screen.getByRole('heading', { level: 2, name: 'Preview' }),
      screen.getByRole('heading', { level: 2, name: 'What it does' }),
      screen.getByRole('heading', { level: 2, name: 'Source' }),
      screen.getByText('related'),
    ]
    for (let i = 1; i < order.length; i++) {
      const earlier = order[i - 1] as Node
      expect(
        earlier.compareDocumentPosition(order[i] as Node) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy()
    }
  })

  // Nested boxes read as clutter: a section is its heading on the page, never a card.
  it('boxes none of its sections', () => {
    const { container } = renderLayout()
    expect(container.querySelector('[data-slot="card"]')).toBeNull()
  })

  it('puts the preview, what it does and the source in their own titled sections', () => {
    renderLayout()

    expect(section('Preview').getByText('preview')).toBeTruthy()
    expect(section('What it does').getByText('Shows the git branch.')).toBeTruthy()
    expect(section('What it does').getByText('Network')).toBeTruthy()
    expect(section('Source').getByText('source')).toBeTruthy()
  })

  it('has no Source card for a page without source', () => {
    renderLayout({ source: undefined })

    expect(screen.queryByRole('heading', { name: 'Source' })).toBeNull()
    expect(screen.getByRole('heading', { level: 2, name: 'What it does' })).toBeTruthy()
  })

  it('needs no notice or related section', () => {
    const { container } = renderLayout({ notice: undefined, related: undefined })

    expect(container.textContent).not.toMatch(/notice|related/)
    expect(screen.getByText('header')).toBeTruthy()
  })
})
