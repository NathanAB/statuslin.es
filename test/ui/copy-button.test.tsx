// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CopyButton } from '@/ui/copy-button'

const writeText = vi.fn<(text: string) => Promise<void>>()

beforeEach(() => {
  writeText.mockReset().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
    writable: true,
  })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('CopyButton', () => {
  it('copies the given text and swaps the label to Copied', async () => {
    render(<CopyButton text="echo hi" label="Copy script" />)

    fireEvent.click(screen.getByRole('button', { name: 'Copy script' }))

    await waitFor(() => expect(screen.getByRole('button', { name: 'Copied' })).toBeTruthy())
    expect(writeText).toHaveBeenCalledWith('echo hi')
  })

  // Copied is shorter than most labels: swapped outright, the button shrank and the link beside it
  // jumped. The label stays in place, hidden, so the button keeps its width.
  it('keeps its width when it swaps to Copied', async () => {
    render(<CopyButton text="echo hi" label="Copy install prompt" size="pill" />)
    fireEvent.click(screen.getByRole('button', { name: 'Copy install prompt' }))

    await waitFor(() => expect(screen.getByRole('button', { name: 'Copied' })).toBeTruthy())
    const held = screen.getByText('Copy install prompt')
    expect(held.getAttribute('aria-hidden')).toBe('true')
    expect(held.className).toContain('invisible')
    expect(screen.getByText('Copied').getAttribute('aria-hidden')).toBeNull()
  })

  // The reset timer outlived the button: it fired on a page the visitor had left, and in CI after
  // the test file's window was gone.
  it('drops its Copied timer when it unmounts', async () => {
    vi.useFakeTimers()
    const { unmount } = render(<CopyButton text="echo hi" label="Copy script" />)
    fireEvent.click(screen.getByRole('button', { name: 'Copy script' }))
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Copied' })).toBeTruthy())
    expect(vi.getTimerCount()).toBe(1)

    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('announces Copied after copying, even with a custom accessible name', async () => {
    render(<CopyButton text="echo hi" ariaLabel="Copy command: From a shell" />)

    fireEvent.click(screen.getByRole('button', { name: 'Copy command: From a shell' }))

    await waitFor(() => expect(screen.getByRole('button', { name: 'Copied' })).toBeTruthy())
  })

  it('calls onCopied only after a successful clipboard write', async () => {
    const onCopied = vi.fn()
    render(<CopyButton text="payload" onCopied={onCopied} />)

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))

    await waitFor(() => expect(onCopied).toHaveBeenCalledOnce())
  })

  it('does not show Copied or call onCopied when the clipboard rejects', async () => {
    writeText.mockRejectedValue(new Error('denied'))
    const onCopied = vi.fn()
    render(<CopyButton text="payload" label="Copy JSON" onCopied={onCopied} />)

    fireEvent.click(screen.getByRole('button', { name: 'Copy JSON' }))

    await waitFor(() => expect(writeText).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: 'Copied' })).toBeNull()
    expect(onCopied).not.toHaveBeenCalled()
  })

  it('stays outline while Copied shows', async () => {
    render(<CopyButton text="x" variant="outline" />)
    const button = screen.getByRole('button', { name: 'Copy' })
    expect(button.className).toContain('bg-background')
    expect(button.className).not.toContain('bg-primary')

    fireEvent.click(button)

    await waitFor(() => expect(screen.getByRole('button', { name: 'Copied' })).toBeTruthy())
    expect(button.className).toContain('bg-background')
    expect(button.className).not.toContain('bg-primary')
  })
})
