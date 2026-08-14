// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { CodeBlock } from '@/ui/code-block'
import { SectionCard } from '@/ui/section-card'

describe('SectionCard', () => {
  it('renders the title and children', () => {
    render(
      <SectionCard title="Preview">
        <p>body</p>
      </SectionCard>,
    )
    expect(screen.getByRole('heading', { level: 3, name: 'Preview' })).toBeTruthy()
    expect(screen.getByText('body')).toBeTruthy()
  })

  it('renders a level-two heading when the page hierarchy requires it', () => {
    render(
      <SectionCard headingLevel={2} title="Source">
        <p>body</p>
      </SectionCard>,
    )
    expect(screen.getByRole('heading', { level: 2, name: 'Source' })).toBeTruthy()
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

  it('copies the source when text is provided', async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
      writable: true,
    })
    render(<CodeBlock text="echo hi">echo hi</CodeBlock>)
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('echo hi'))
  })
})
