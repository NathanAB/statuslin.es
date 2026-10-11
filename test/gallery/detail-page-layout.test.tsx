// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { DetailPageLayout } from '@/gallery/detail-page-layout'

const CONTENT = {
  whatItShows: ['The git branch'],
  requirements: [],
  behaviorNotes: ['Fades as context fills'],
}

function renderLayout(overrides: Partial<Parameters<typeof DetailPageLayout>[0]> = {}) {
  return render(
    <DetailPageLayout
      notice={<p>notice</p>}
      header={<h1>header</h1>}
      install={<p>install</p>}
      preview={<p>preview</p>}
      detail={{ title: 'Source', content: <p>source</p> }}
      generatedContent={CONTENT}
      related={<p>related</p>}
      {...overrides}
    />,
  )
}

/** The card holding the section whose h2 is `title`. */
function section(title: string) {
  const heading = screen.getByRole('heading', { level: 2, name: title })
  const card = heading.closest('[data-slot="card"]')
  if (!(card instanceof HTMLElement)) throw new Error(`no card around ${title}`)
  return within(card)
}

describe('DetailPageLayout', () => {
  it('runs notice, header, install, preview, detail, generated copy, then related', () => {
    renderLayout()

    const order = [
      screen.getByText('notice'),
      screen.getByText('header'),
      screen.getByText('install'),
      screen.getByRole('heading', { level: 2, name: 'Preview' }),
      screen.getByRole('heading', { level: 2, name: 'Source' }),
      screen.getByRole('heading', { level: 2, name: 'What it shows' }),
      screen.getByRole('heading', { level: 2, name: 'Behavior notes' }),
      screen.getByText('related'),
    ]
    for (let i = 1; i < order.length; i++) {
      const earlier = order[i - 1] as Node
      expect(
        earlier.compareDocumentPosition(order[i] as Node) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy()
    }
  })

  it('puts the preview and the detail section in their own titled cards', () => {
    renderLayout({ detail: { title: 'What it does', content: <p>footprint</p> } })

    expect(section('Preview').getByText('preview')).toBeTruthy()
    expect(section('What it does').getByText('footprint')).toBeTruthy()
  })

  it('renders no generated copy when there is none', () => {
    renderLayout({ generatedContent: null })

    expect(screen.queryByRole('heading', { name: 'What it shows' })).toBeNull()
  })

  it('needs no notice or related section', () => {
    const { container } = renderLayout({ notice: undefined, related: undefined })

    expect(container.textContent).not.toMatch(/notice|related/)
    expect(screen.getByText('header')).toBeTruthy()
  })
})
