// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { AuthorChip } from '@/ui/author-chip'

describe('AuthorChip', () => {
  it('renders the name and a rounded image when an image is present', () => {
    const { container } = render(
      <AuthorChip
        author={{ name: 'Ada Lovelace', username: null, image: 'https://example.com/a.png' }}
      />,
    )

    expect(screen.getByText('Ada Lovelace')).toBeTruthy()
    // An empty-alt img carries the `presentation` role (not `img`), so query the element directly.
    const img = container.querySelector('img') as HTMLImageElement
    expect(img).not.toBeNull()
    expect(img.getAttribute('src')).toBe('https://example.com/a.png')
    // alt is empty: the name sits right next to it, so an alt would duplicate it.
    expect(img.getAttribute('alt')).toBe('')
    expect(img.className).toContain('rounded-full')
  })

  it('renders the uppercased initial in a fallback circle when image is null', () => {
    const { container } = render(
      <AuthorChip author={{ name: 'ada', username: null, image: null }} />,
    )

    expect(screen.getByText('ada')).toBeTruthy()
    expect(screen.getByText('A')).toBeTruthy()
    expect(container.querySelector('img')).toBeNull()
  })

  it('renders nothing when author is null', () => {
    const { container } = render(<AuthorChip author={null} />)
    expect(container.firstChild).toBeNull()
  })

  it('links to the GitHub profile and shows @username when username is present', () => {
    const { container } = render(
      <AuthorChip
        author={{ name: 'Ada Lovelace', username: 'ada', image: 'https://example.com/a.png' }}
      />,
    )

    const anchor = container.querySelector('a') as HTMLAnchorElement
    expect(anchor).not.toBeNull()
    expect(anchor.getAttribute('href')).toBe('https://github.com/ada')
    expect(anchor.getAttribute('target')).toBe('_blank')
    expect(anchor.getAttribute('rel')).toBe('noopener noreferrer')
    expect(screen.getByText('@ada')).toBeTruthy()
  })

  it('does not link and shows the display name when username is null', () => {
    const { container } = render(
      <AuthorChip author={{ name: 'Ada Lovelace', username: null, image: null }} />,
    )

    expect(container.querySelector('a')).toBeNull()
    expect(screen.getByText('Ada Lovelace')).toBeTruthy()
  })
})
