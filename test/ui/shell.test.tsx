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
const { PageShell, CenteredShell } = await import('@/ui/shell')

describe('PageShell', () => {
  it('renders the header, a constrained main, and its children', () => {
    const { container } = render(
      <PageShell user={null}>
        <p>body</p>
      </PageShell>,
    )
    expect(container.querySelector('header')).not.toBeNull()
    const main = container.querySelector('main') as HTMLElement
    expect(main.className).toContain('max-w-5xl')
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

describe('PageShell narrow', () => {
  it('constrains main to max-w-lg when narrow is true', () => {
    const { container } = render(
      <PageShell user={null} narrow>
        <p>narrow</p>
      </PageShell>,
    )
    const main = container.querySelector('main') as HTMLElement
    expect(main.className).toContain('max-w-lg')
    expect(main.className).not.toContain('max-w-5xl')
  })

  it('uses the default max-w-5xl when narrow is not set', () => {
    const { container } = render(
      <PageShell user={null}>
        <p>wide</p>
      </PageShell>,
    )
    const main = container.querySelector('main') as HTMLElement
    expect(main.className).toContain('max-w-5xl')
    expect(main.className).not.toContain('max-w-lg')
  })
})
