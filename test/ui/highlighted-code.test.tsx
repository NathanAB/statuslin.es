// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HighlightedCode } from '@/ui/highlighted-code'

const writeText = vi.fn<(text: string) => Promise<void>>()

beforeEach(() => {
  writeText.mockReset().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
    writable: true,
  })
})

const html = '<pre class="shiki"><code>echo hi</code></pre>'

describe('HighlightedCode', () => {
  it('renders the highlighted markup without a copy control when text is omitted', () => {
    const { container } = render(<HighlightedCode html={html} />)
    expect(container.querySelector('.shiki')?.textContent).toBe('echo hi')
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('copies the raw text from the overlay control', async () => {
    render(<HighlightedCode html={html} text="echo hi" copyLabel="Copy script" />)

    fireEvent.click(screen.getByRole('button', { name: 'Copy script' }))

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('echo hi'))
  })
})
