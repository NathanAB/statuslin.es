// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { RESOURCES_TITLE_BASE } from '@/lib/page-title'

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    params,
    children,
    ...props
  }: {
    to: string
    params?: Record<string, string>
    children: React.ReactNode
  }) => {
    let href = to
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        href = href.replace(`$${key}`, value)
      }
    }
    return (
      <a href={href} {...props}>
        {children}
      </a>
    )
  },
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
    expect(RESOURCES_TITLE_BASE).toBe('Claude Code Status Line Tools & Resources')
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

  it('cross-links the gallery, guide, and submit, and shows the submit button when signed out', () => {
    const { container } = render(<ResourcesContent signedIn={false} />)
    for (const href of ['/', '/guide', '/submit']) {
      expect(container.querySelector(`a[href="${href}"]`)).not.toBeNull()
    }
    expect(screen.getByRole('heading', { level: 2, name: /get listed/i })).toBeTruthy()
    expect(screen.getByText('Submit a status line')).toBeTruthy()
  })

  it('compares four setup paths without FAQPage schema', () => {
    const { container } = render(<ResourcesContent signedIn={false} />)
    expect(
      screen.getByRole('heading', { level: 2, name: /four ways to get a status line/i }),
    ).toBeTruthy()
    expect(container.innerHTML).not.toMatch(/FAQPage/)
  })

  it('links only indexable gallery targets, not the thin powerline facet', () => {
    const { container } = render(<ResourcesContent signedIn={false} />)
    expect(container.querySelector('a[href="/c/powerline-dracula-6936b97c"]')).not.toBeNull()
    expect(container.querySelector('a[href="/status-lines/token-usage"]')).not.toBeNull()
    expect(container.querySelector('a[href="/c/quota-fallback-2a730aa6"]')).not.toBeNull()
    expect(container.querySelector('a[href="/status-lines/powerline"]')).toBeNull()
  })

  it('links to /submit when signed in', () => {
    const { container } = render(<ResourcesContent signedIn={true} />)
    expect(container.querySelector('a[href="/submit"]')).not.toBeNull()
  })
})
