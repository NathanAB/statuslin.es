// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Button } from '@/ui/button'

describe('Button active variant', () => {
  it('adds the active-tab classes when active is set', () => {
    const { container } = render(
      <Button variant="outline" active>
        Top
      </Button>,
    )
    const el = container.querySelector('[data-slot=button]') as HTMLElement
    expect(el.className).toContain('border-primary/50')
    expect(el.className).toContain('text-foreground')
  })

  it('omits the active classes by default', () => {
    const { container } = render(<Button variant="outline">Top</Button>)
    const el = container.querySelector('[data-slot=button]') as HTMLElement
    expect(el.className).not.toContain('border-primary/50')
  })
})

describe('Button pill size', () => {
  const icon = <svg data-testid="icon" />

  it('sets the trailing icon in its own circle, leaving the label as the name', () => {
    render(
      <Button size="pill" trailingIcon={icon}>
        Copy install prompt
      </Button>,
    )
    const button = screen.getByRole('button', { name: 'Copy install prompt' })
    const circle = screen.getByTestId('icon').parentElement as HTMLElement
    expect(circle.parentElement).toBe(button)
    expect(circle.getAttribute('aria-hidden')).toBe('true')
    expect(circle.className).toContain('rounded-full')
  })

  it('keeps the icon circle when it wraps a link', () => {
    render(
      <Button size="pill" variant="secondary" trailingIcon={icon} asChild>
        <a href="/?page=2">Next page</a>
      </Button>,
    )
    const link = screen.getByRole('link', { name: 'Next page' })
    expect(link.getAttribute('href')).toBe('/?page=2')
    expect(link.contains(screen.getByTestId('icon'))).toBe(true)
  })

  it('scales down on press instead of nudging down', () => {
    render(
      <Button size="pill" trailingIcon={icon}>
        Copy
      </Button>,
    )
    const { className } = screen.getByRole('button')
    expect(className).toContain('active:scale-98')
    expect(className).not.toContain('translate-y-px')
  })
})
