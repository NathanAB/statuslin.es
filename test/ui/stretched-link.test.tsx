// @vitest-environment jsdom
import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

// TanStack Router's <Link> needs a router context; stub it to a plain anchor that
// forwards `to`/`params` so we can assert href + the overlay classes in isolation.
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
    const href = params ? to.replace(/\$(\w+)/g, (_, k) => params[k] ?? '') : to
    return (
      <a href={href} {...props}>
        {children}
      </a>
    )
  },
}))

const { StretchedLink } = await import('@/ui/stretched-link')
const { TextLink } = await import('@/ui/text')

describe('StretchedLink', () => {
  it('renders the after-overlay + focus-ring classes verbatim', () => {
    const { container } = render(
      <StretchedLink to="/c/$slug" params={{ slug: 'abc' }}>
        Title
      </StretchedLink>,
    )
    const a = container.querySelector('a') as HTMLAnchorElement
    expect(a).not.toBeNull()
    expect(a.getAttribute('href')).toBe('/c/abc')
    for (const cls of [
      'after:absolute',
      'after:inset-0',
      'focus-visible:outline-none',
      'focus-visible:ring-3',
      'focus-visible:ring-ring/50',
    ]) {
      expect(a.className.split(/\s+/)).toContain(cls)
    }
  })
})

describe('TextLink', () => {
  it('renders the primary link styling and href', () => {
    const { container } = render(<TextLink to="/">Back to gallery</TextLink>)
    const a = container.querySelector('a') as HTMLAnchorElement
    expect(a.getAttribute('href')).toBe('/')
    expect(a.className).toContain('text-primary')
    expect(a.className).toContain('hover:underline')
  })
})
