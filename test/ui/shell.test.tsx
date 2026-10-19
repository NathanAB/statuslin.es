// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

// AppHeader (rendered inside both shells) uses TanStack Router's <Link>; stub it.
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...props }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}))

const { CONTACT_EMAIL } = await import('@/lib/site')
const { PAGE_COLUMN } = await import('@/ui/page-column')
const { PageShell, CenteredShell } = await import('@/ui/shell')

// Every page's header, content and footer sit on the one column, so nothing jumps between pages.
function expectOnColumn(el: Element | null) {
  for (const name of PAGE_COLUMN.split(' ')) expect(el?.classList.contains(name), name).toBe(true)
}

describe('PageShell', () => {
  it('lines the header, the content and the footer up on the same column', () => {
    const { container } = render(
      <PageShell user={null}>
        <p>body</p>
      </PageShell>,
    )
    expectOnColumn(container.querySelector('header > div'))
    expectOnColumn(container.querySelector('main'))
    expectOnColumn(container.querySelector('footer'))
    expect(screen.getByText('body')).toBeTruthy()
  })

  it('renders the site footer with the contact link', () => {
    const { container } = render(
      <PageShell user={null}>
        <p>body</p>
      </PageShell>,
    )
    const footer = container.querySelector('footer')
    expect(footer).not.toBeNull()
    expect(footer?.querySelector(`a[href="mailto:${CONTACT_EMAIL}"]`)).not.toBeNull()
  })

  it('grows main so the footer sticks to the bottom on short pages', () => {
    const { container } = render(
      <PageShell user={null}>
        <p>body</p>
      </PageShell>,
    )
    const main = container.querySelector('main') as HTMLElement
    expect(main.className).toContain('flex-1')
  })
})

describe('CenteredShell', () => {
  it('renders a flex-1 centered main with the children', () => {
    const { container } = render(
      <CenteredShell user={null}>
        <p>centered</p>
      </CenteredShell>,
    )
    const main = container.querySelector('main') as HTMLElement
    expect(main.className).toContain('flex-1')
    expect(main.className).toContain('items-center')
    expect(main.className).toContain('justify-center')
    expect(screen.getByText('centered')).toBeTruthy()
  })

  it('keeps the header and footer on the same column as every other page', () => {
    const { container } = render(
      <CenteredShell user={null}>
        <p>centered</p>
      </CenteredShell>,
    )
    expectOnColumn(container.querySelector('header > div'))
    expectOnColumn(container.querySelector('footer'))
  })

  it('renders the site footer with the contact link', () => {
    const { container } = render(
      <CenteredShell user={null}>
        <p>centered</p>
      </CenteredShell>,
    )
    const footer = container.querySelector('footer')
    expect(footer).not.toBeNull()
    expect(footer?.querySelector(`a[href="mailto:${CONTACT_EMAIL}"]`)).not.toBeNull()
  })
})

describe('PageShell fullBleed', () => {
  // The home page lays out its own full-width bands, each section placing itself on the column.
  it('lets main span the window, with the header and footer still on the column', () => {
    const { container } = render(
      <PageShell user={null} fullBleed>
        <p>home</p>
      </PageShell>,
    )
    const main = container.querySelector('main') as HTMLElement
    expect(main.className).not.toContain('max-w-')
    expect(main.className).not.toContain('px-')
    expectOnColumn(container.querySelector('header > div'))
    expectOnColumn(container.querySelector('footer'))
  })
})

describe('PageShell footerNote', () => {
  it("passes the page's note to the footer", () => {
    const { container } = render(
      <PageShell user={null} fullBleed footerNote="12 status lines, copied 3 times.">
        <p>home</p>
      </PageShell>,
    )
    expect(container.querySelector('footer')?.textContent).toContain(
      '12 status lines, copied 3 times.',
    )
  })
})
