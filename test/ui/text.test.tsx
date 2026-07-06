// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

// TextLink's `to` variant renders TanStack Router's <Link>, which needs a router context;
// stub it to a plain anchor (same convention as test/ui/stretched-link.test.tsx).
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...props }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}))

const { Heading, Text, TextLink } = await import('@/ui/text')

describe('Heading', () => {
  it('renders the page-title style at level 1 (h1)', () => {
    const { container } = render(<Heading level={1}>Title</Heading>)
    const h1 = container.querySelector('h1') as HTMLElement
    expect(h1).not.toBeNull()
    expect(h1.className).toContain('font-semibold')
    expect(h1.className).toContain('text-2xl')
    expect(h1.className).toContain('text-foreground')
    expect(screen.getByText('Title')).toBeTruthy()
  })

  it('renders a smaller section style at level 2 (h2)', () => {
    const { container } = render(<Heading level={2}>Sub</Heading>)
    const h2 = container.querySelector('h2') as HTMLElement
    expect(h2).not.toBeNull()
    expect(h2.className).toContain('font-semibold')
    expect(h2.className).toContain('text-lg')
  })

  it('renders the card/section-title style at level 3 (h3)', () => {
    const { container } = render(<Heading level={3}>Card</Heading>)
    const h3 = container.querySelector('h3') as HTMLElement
    expect(h3).not.toBeNull()
    expect(h3.className).toContain('font-medium')
    expect(h3.className).toContain('text-base')
  })

  it('never uses a monospace (or any non-default) font at any level', () => {
    for (const level of [1, 2, 3] as const) {
      const { container } = render(<Heading level={level}>X</Heading>)
      const el = container.firstChild as HTMLElement
      expect(el.className).not.toContain('font-mono')
    }
  })
})

describe('Text', () => {
  it('renders body text in a p by default at the base size', () => {
    const { container } = render(<Text>hello</Text>)
    const el = container.firstChild as HTMLElement
    expect(el.tagName).toBe('P')
    expect(el.className).toContain('text-foreground')
    expect(el.className).not.toContain('text-sm')
    expect(el.className).not.toContain('text-xs')
  })

  it('applies muted color and the sm size', () => {
    const { container } = render(
      <Text muted size="sm">
        hello
      </Text>,
    )
    const el = container.firstChild as HTMLElement
    expect(el.className).toContain('text-muted-foreground')
    expect(el.className).toContain('text-sm')
  })

  it('applies the xs size', () => {
    const { container } = render(<Text size="xs">tiny</Text>)
    expect((container.firstChild as HTMLElement).className).toContain('text-xs')
  })

  it('renders an inline span when inline is set', () => {
    const { container } = render(<Text inline>x</Text>)
    expect((container.firstChild as HTMLElement).tagName).toBe('SPAN')
  })

  it('applies the monospace font for code/data values via mono', () => {
    const { container } = render(<Text mono>abc123</Text>)
    expect((container.firstChild as HTMLElement).className).toContain('font-mono')
  })

  it('constrains line length with the measure prop', () => {
    const { container } = render(<Text measure>hello</Text>)
    expect((container.firstChild as HTMLElement).className).toContain('max-w-2xl')
  })

  it('does not constrain width by default', () => {
    const { container } = render(<Text>hello</Text>)
    expect((container.firstChild as HTMLElement).className).not.toContain('max-w-2xl')
  })
})

describe('TextLink (href / external)', () => {
  it('opens an http(s) link in a new tab with a safe rel', () => {
    const { container } = render(<TextLink href="https://example.com/docs">docs</TextLink>)
    const a = container.querySelector('a') as HTMLAnchorElement
    expect(a.getAttribute('href')).toBe('https://example.com/docs')
    expect(a.getAttribute('target')).toBe('_blank')
    expect(a.getAttribute('rel')).toBe('noopener noreferrer')
  })

  it('does not put target=_blank on a mailto link (it launches a mail client, not a tab)', () => {
    const { container } = render(<TextLink href="mailto:hello@statuslin.es">contact</TextLink>)
    const a = container.querySelector('a') as HTMLAnchorElement
    expect(a.getAttribute('href')).toBe('mailto:hello@statuslin.es')
    expect(a.getAttribute('target')).toBeNull()
    expect(a.getAttribute('rel')).toBeNull()
  })
})

describe('TextLink size', () => {
  it('inherits the surrounding text size by default (href variant): no text-size class', () => {
    const { container } = render(<TextLink href="https://example.com">docs</TextLink>)
    const a = container.querySelector('a') as HTMLAnchorElement
    expect(a.className).not.toContain('text-sm')
    expect(a.className).not.toContain('text-xs')
    expect(a.className).not.toContain('text-base')
    expect(a.className).toContain('text-primary')
    expect(a.className).toContain('underline-offset-4')
    expect(a.className).toContain('hover:underline')
  })

  it('inherits the surrounding text size by default (to variant): no text-size class', () => {
    const { container } = render(<TextLink to="/">home</TextLink>)
    const a = container.querySelector('a') as HTMLAnchorElement
    expect(a.className).not.toContain('text-sm')
    expect(a.className).not.toContain('text-xs')
    expect(a.className).toContain('text-primary')
  })

  it('renders text-sm when size="sm" (href variant)', () => {
    const { container } = render(
      <TextLink href="https://example.com" size="sm">
        docs
      </TextLink>,
    )
    const a = container.querySelector('a') as HTMLAnchorElement
    expect(a.className).toContain('text-sm')
    expect(a.className).toContain('text-primary')
  })

  it('renders text-sm when size="sm" (to variant)', () => {
    const { container } = render(
      <TextLink to="/" size="sm">
        home
      </TextLink>,
    )
    const a = container.querySelector('a') as HTMLAnchorElement
    expect(a.className).toContain('text-sm')
  })
})
