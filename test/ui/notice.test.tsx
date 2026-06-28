// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Notice } from '@/ui/notice'

describe('Notice', () => {
  it('renders children inside a rounded box', () => {
    const { container } = render(<Notice tone="info">All good</Notice>)
    expect(screen.getByText('All good')).toBeTruthy()
    const el = container.firstChild as HTMLElement
    expect(el.className).toContain('rounded-md')
  })

  it('uses muted background for tone="info"', () => {
    const { container } = render(<Notice tone="info">Info</Notice>)
    const el = container.firstChild as HTMLElement
    expect(el.className).toContain('bg-muted')
    expect(el.className).not.toContain('bg-destructive')
  })

  it('uses destructive/10 background for tone="error"', () => {
    const { container } = render(<Notice tone="error">Oops</Notice>)
    const el = container.firstChild as HTMLElement
    expect(el.className).toContain('bg-destructive/10')
    expect(el.className).not.toContain('bg-muted')
  })

  it('applies destructive text color for tone="error"', () => {
    const { container } = render(<Notice tone="error">Oops</Notice>)
    const el = container.firstChild as HTMLElement
    expect(el.className).toContain('text-destructive')
  })

  it('applies foreground text color for tone="info"', () => {
    const { container } = render(<Notice tone="info">Ok</Notice>)
    const el = container.firstChild as HTMLElement
    expect(el.className).toContain('text-foreground')
  })
})
