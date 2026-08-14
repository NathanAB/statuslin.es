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
  it('copies the given text and swaps the label to Copied!', async () => {
    render(<CopyButton text="echo hi" label="Copy script" />)

    fireEvent.click(screen.getByRole('button', { name: 'Copy script' }))

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('echo hi'))
    expect(screen.getByRole('button', { name: 'Copied!' })).toBeTruthy()
  })

  it('calls onCopied only after a successful clipboard write', async () => {
    const onCopied = vi.fn()
    render(<CopyButton text="payload" onCopied={onCopied} />)

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))

    await waitFor(() => expect(onCopied).toHaveBeenCalledOnce())
  })

  it('does not show Copied! or call onCopied when the clipboard rejects', async () => {
    writeText.mockRejectedValue(new Error('denied'))
    const onCopied = vi.fn()
    render(<CopyButton text="payload" label="Copy JSON" onCopied={onCopied} />)

    fireEvent.click(screen.getByRole('button', { name: 'Copy JSON' }))

    await waitFor(() => expect(writeText).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: 'Copied!' })).toBeNull()
    expect(onCopied).not.toHaveBeenCalled()
  })

  it('stays outline while Copied! shows', async () => {
    render(<CopyButton text="x" variant="outline" />)
    const button = screen.getByRole('button', { name: 'Copy' })
    expect(button.className).toContain('bg-background')
    expect(button.className).not.toContain('bg-primary')

    fireEvent.click(button)

    await waitFor(() => expect(screen.getByRole('button', { name: 'Copied!' })).toBeTruthy())
    expect(button.className).toContain('bg-background')
    expect(button.className).not.toContain('bg-primary')
  })
})
