// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { DetailByline } from '@/gallery/detail-byline'

const AUTHOR = { name: 'Octo Cat', username: 'octocat', image: 'https://example.com/octocat.png' }
const SOURCE = { lead: 'source at', label: '0123456', href: 'https://github.com/octocat/mods' }

describe('DetailByline', () => {
  it('renders nothing when there is no fact to show', () => {
    const { container } = render(<DetailByline author={null} source={null} license={null} />)

    expect(container.innerHTML).toBe('')
  })

  it('credits the author alone, with no dot', () => {
    render(<DetailByline author={AUTHOR} source={null} license={null} />)

    expect(screen.getByText('by')).toBeTruthy()
    expect(screen.getByRole('link', { name: /@octocat/ }).getAttribute('href')).toBe(
      'https://github.com/octocat',
    )
    expect(screen.queryByText('·')).toBeNull()
  })

  it('leads each later fact with its dot, so a wrapped line never ends on one', () => {
    render(<DetailByline author={AUTHOR} source={SOURCE} license="MIT licence" />)

    const dots = screen.getAllByText('·')
    expect(dots).toHaveLength(2)
    expect(dots[0]?.parentElement?.textContent).toBe('·source at 0123456')
    expect(dots[1]?.parentElement?.textContent).toBe('·MIT licence')
  })

  it('links the source after its lead words', () => {
    render(<DetailByline author={AUTHOR} source={SOURCE} license={null} />)

    const link = screen.getByRole('link', { name: '0123456' })
    expect(link.getAttribute('href')).toBe(SOURCE.href)
    expect(link.parentElement?.textContent).toBe('source at 0123456')
  })

  it('shows a source with no lead words as the link alone', () => {
    render(
      <DetailByline
        author={AUTHOR}
        source={{ label: 'original source', href: 'https://example.com/x' }}
        license={null}
      />,
    )

    const link = screen.getByRole('link', { name: 'original source' })
    expect(link.parentElement?.textContent).toBe('original source')
  })

  it('puts no dot before the first fact when there is no author', () => {
    render(<DetailByline author={null} source={null} license="MIT licence" />)

    expect(screen.getByText('MIT licence')).toBeTruthy()
    expect(screen.queryByText('·')).toBeNull()
  })

  it('keeps the facts in author, source, licence order', () => {
    const { container } = render(
      <DetailByline author={AUTHOR} source={SOURCE} license="MIT licence" />,
    )

    expect(container.textContent?.replace(/\s+/g, ' ')).toBe(
      'by@octocat·source at 0123456·MIT licence',
    )
  })
})
