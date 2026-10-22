// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

// SiteFooter's Terms link uses TanStack Router's <Link>; stub it to a plain anchor.
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...props }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}))

const { CONTACT_EMAIL, MODS_PATH, REPO_URL, SITE_NAME } = await import('@/lib/site')
const { GUIDE_SUBPAGES, HOME_HEADING } = await import('@/lib/page-title')
const { SiteFooter } = await import('@/ui/site-footer')

describe('SiteFooter', () => {
  it('renders a mailto Contact link, the abuse-report path', () => {
    const { container } = render(<SiteFooter />)
    const link = container.querySelector('a[href^="mailto:"]') as HTMLAnchorElement
    expect(link).not.toBeNull()
    expect(link.getAttribute('href')).toBe(`mailto:${CONTACT_EMAIL}`)
    expect(link.textContent).toBe('Contact')
  })

  it('keeps every link in the footer navigation', () => {
    const { container } = render(<SiteFooter />)
    const nav = screen.getByRole('navigation', { name: 'Footer' })
    expect(nav.querySelectorAll('a').length).toBe(container.querySelectorAll('a').length)
    expect(nav.querySelectorAll('a').length).toBe(14)
  })

  // Columns of their own instead of one row that wraps wherever the width happens to break it.
  it('groups its links under Browse, Guides and About', () => {
    render(<SiteFooter />)
    const names = (list: string) =>
      Array.from(
        screen.getByRole('list', { name: list }).querySelectorAll('a'),
        (a) => a.textContent,
      )
    // Parallel names: the two ranked lists side by side, neither repeating "Browse".
    expect(names('Browse')).toEqual(['Best mods', 'Best status lines', 'Resources', 'Submit'])
    expect(names('Guides')).toEqual([
      'Write a status line',
      'Status line not showing?',
      'Claude Desktop',
      'Status lines vs mods',
      'Are mods safe?',
      'Buddy pets',
    ])
    expect(names('About')).toEqual(['How it works', 'GitHub', 'Contact', 'Terms'])
  })

  // The owner dropped the tagline and the home page's inventory line: only the copyright stays.
  it('carries a copyright line and no tagline', () => {
    render(<SiteFooter />)
    expect(screen.queryByText(HOME_HEADING)).toBeNull()
    expect(screen.getByText(`© ${new Date().getFullYear()} ${SITE_NAME}`)).toBeTruthy()
  })

  it('renders a source link to the public repo that opens in a new tab', () => {
    const { container } = render(<SiteFooter />)
    const link = container.querySelector(`a[href="${REPO_URL}"]`) as HTMLAnchorElement
    expect(link).not.toBeNull()
    expect(link.textContent).toMatch(/github/i)
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toContain('noopener')
  })

  // When the home gallery's list grows or shrinks, the footer slides with it instead of fading.
  it('names itself for a view transition', () => {
    const { container } = render(<SiteFooter />)
    const footer = container.querySelector('footer') as HTMLElement
    expect(footer.className.split(/\s+/)).toContain('[view-transition-name:site-footer]')
  })

  it('links to the Terms page', () => {
    const { container } = render(<SiteFooter />)
    const link = container.querySelector('a[href="/terms"]') as HTMLAnchorElement
    expect(link).not.toBeNull()
    expect(link.textContent).toMatch(/terms/i)
  })

  it('links to the resources page', () => {
    const { container } = render(<SiteFooter />)
    const resources = container.querySelector('a[href="/resources"]') as HTMLAnchorElement
    expect(resources).not.toBeNull()
    expect(resources.textContent).toMatch(/resources/i)
  })

  it('links to the guide page', () => {
    const { container } = render(<SiteFooter />)
    const guide = container.querySelector('a[href="/guide"]') as HTMLAnchorElement
    expect(guide).not.toBeNull()
    expect(guide.textContent).toBe('Write a status line')
  })

  it('links the best mods and the best status lines', () => {
    const { container } = render(<SiteFooter />)
    expect(container.querySelector(`a[href="${MODS_PATH}"]`)?.textContent).toBe('Best mods')
    expect(container.querySelector('a[href="/status-lines/best"]')?.textContent).toBe(
      'Best status lines',
    )
  })

  it('links every guide subpage', () => {
    const { container } = render(<SiteFooter />)
    for (const { path } of GUIDE_SUBPAGES) {
      expect(container.querySelector(`a[href="${path}"]`), path).not.toBeNull()
    }
  })
})
