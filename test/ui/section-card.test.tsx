// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { CodeBlock } from '@/ui/code-block'
import { SectionCard } from '@/ui/section-card'

describe('SectionCard', () => {
  it('renders the title and children', () => {
    render(
      <SectionCard title="Preview">
        <p>body</p>
      </SectionCard>,
    )
    expect(screen.getByText('Preview')).toBeTruthy()
    expect(screen.getByText('body')).toBeTruthy()
  })

  it('renders an action next to the title when provided', () => {
    render(
      <SectionCard title="Source" action={<button type="button">Copy</button>}>
        <p>body</p>
      </SectionCard>,
    )
    expect(screen.getByText('Source')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Copy' })).toBeTruthy()
  })
})

describe('CodeBlock', () => {
  it('renders a pre with the source styling', () => {
    const { container } = render(<CodeBlock>echo hi</CodeBlock>)
    const pre = container.querySelector('pre') as HTMLElement
    expect(pre).not.toBeNull()
    expect(pre.className).toContain('bg-sunken')
    expect(pre.className).toContain('font-mono')
    expect(pre.className).toContain('p-4')
    expect(screen.getByText('echo hi')).toBeTruthy()
  })

  it('uses tighter padding when compact', () => {
    const { container } = render(<CodeBlock compact>echo hi</CodeBlock>)
    const pre = container.querySelector('pre') as HTMLElement
    expect(pre.className).toContain('p-3')
    expect(pre.className).toContain('mt-2')
  })
})
