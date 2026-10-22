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

const lines = (n: number) => `${Array.from({ length: n }, (_, i) => `echo ${i + 1}`).join('\n')}\n`
const pre = (text: string) => `<pre class="shiki"><code>${text}</code></pre>`
const renderPeek = (text: string) =>
  render(<HighlightedCode peek html={pre(text)} text={text} copyLabel="Copy script" />)

// A status line's script runs about 200 lines, four screens of code under the page's facts. A long
// one opens on its first lines, with the rest one click away; the page still holds all of it.
describe('HighlightedCode peek', () => {
  it('folds a long script behind a button that counts its lines, with all of it in the page', () => {
    renderPeek(lines(214))

    expect(screen.getByRole('button', { name: 'Show all 214 lines' })).toBeTruthy()
    expect(document.querySelector('.shiki')?.textContent).toContain('echo 214')
  })

  it('opens the whole script and moves focus onto it', () => {
    renderPeek(lines(214))

    fireEvent.click(screen.getByRole('button', { name: 'Show all 214 lines' }))

    expect(screen.queryByRole('button', { name: /^Show all/ })).toBeNull()
    expect(document.activeElement).not.toBe(document.body)
    expect(document.activeElement?.contains(document.querySelector('.shiki'))).toBe(true)
  })

  it('shows a script of 20 lines or fewer whole', () => {
    renderPeek(lines(20))

    expect(screen.queryByRole('button', { name: /^Show all/ })).toBeNull()
  })

  it('copies the whole script while folded', async () => {
    const text = lines(214)
    renderPeek(text)

    fireEvent.click(screen.getByRole('button', { name: 'Copy script' }))

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(text))
  })
})
