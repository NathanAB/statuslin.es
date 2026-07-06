// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

// ResourcesContent's internal links use TanStack Router's <Link>; stub it to a plain anchor.
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...props }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}))

const { RESOURCE_SECTIONS } = await import('@/resources/data')
const { ResourcesContent } = await import('@/resources/resources-content')

const ALL = RESOURCE_SECTIONS.flatMap((s) => s.resources)

describe('ResourcesContent', () => {
  it('renders the h1 and every section heading', () => {
    render(<ResourcesContent signedIn={false} />)
    expect(
      screen.getByRole('heading', { level: 1, name: /claude code status line tools & resources/i }),
    ).toBeTruthy()
    for (const section of RESOURCE_SECTIONS) {
      expect(screen.getByRole('heading', { level: 2, name: section.title })).toBeTruthy()
    }
  })

  it('renders every entry as an external link that opens in a new tab, plus its description', () => {
    const { container } = render(<ResourcesContent signedIn={false} />)
    for (const r of ALL) {
      const link = container.querySelector(`a[href="${r.url}"]`) as HTMLAnchorElement
      expect(link).not.toBeNull()
      expect(link.getAttribute('target')).toBe('_blank')
      expect(link.getAttribute('rel')).toContain('noopener')
      expect(screen.getByText(r.description)).toBeTruthy()
    }
  })

  it('renders a destination badge for each resource card', () => {
    render(<ResourcesContent signedIn={false} />)
    expect(screen.getAllByText('GitHub').length).toBeGreaterThanOrEqual(1)
  })

  it('cross-links the guide and gallery, and shows the submit button when signed out', () => {
    const { container } = render(<ResourcesContent signedIn={false} />)
    for (const href of ['/guide', '/', '/submit']) {
      expect(container.querySelector(`a[href="${href}"]`)).not.toBeNull()
    }
    expect(screen.getByRole('heading', { level: 2, name: /get listed/i })).toBeTruthy()
    expect(screen.getByText('Submit a status line')).toBeTruthy()
  })

  it('links to /submit when signed in', () => {
    const { container } = render(<ResourcesContent signedIn={true} />)
    expect(container.querySelector('a[href="/submit"]')).not.toBeNull()
  })
})
