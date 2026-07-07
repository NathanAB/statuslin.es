// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AdoptPrompt, CopyScriptButton } from '@/adopt/adopt-actions'
import { buildClaudePrompt } from '@/adopt/install'

const recordCopyFn = vi.hoisted(() => vi.fn())
vi.mock('@/adopt/functions', () => ({ recordCopyFn }))

// useRecordedCopy reads the browser's PostHog ids to pass them to the server-side copy event.
vi.mock('@posthog/react', () => ({
  usePostHog: () => ({ get_distinct_id: () => 'did-test', get_session_id: () => 'sid-test' }),
}))

const toast = vi.hoisted(() => vi.fn())
vi.mock('sonner', () => ({ toast }))

const writeText = vi.fn<(text: string) => Promise<void>>()

const props = {
  source: '#!/usr/bin/env bash\necho hi',
  interpreter: 'bash' as const,
  title: 'My Statusline',
  configId: 'cfg-1',
  copyCount: 5,
}

// The prompt button's accessible name is its (stable) aria-label, which keeps the
// visible "Copy install prompt" text inside it (WCAG label-in-name).
const promptButton = () =>
  screen.getByRole('button', { name: 'Copy install prompt — My Statusline' })

beforeEach(() => {
  writeText.mockReset().mockResolvedValue(undefined)
  recordCopyFn.mockReset().mockResolvedValue(6)
  toast.mockReset()
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
    writable: true,
  })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('AdoptPrompt', () => {
  it('renders a coral lg "Copy install prompt" button', () => {
    render(<AdoptPrompt {...props} />)
    expect(screen.getByText('Copy install prompt')).toBeTruthy()
    // Coral (default/primary variant) at the large size.
    expect(promptButton().className).toContain('bg-primary')
    expect(promptButton().getAttribute('data-size')).toBe('lg')
  })

  it('copies the built Claude prompt and records the copy', async () => {
    render(<AdoptPrompt {...props} />)

    fireEvent.click(promptButton())

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(buildClaudePrompt(props))
    })
    await waitFor(() => expect(recordCopyFn).toHaveBeenCalled())
  })

  it('does not show "Copied!" or record when the clipboard rejects', async () => {
    writeText.mockRejectedValue(new Error('denied'))
    render(<AdoptPrompt {...props} />)

    fireEvent.click(promptButton())

    await waitFor(() => expect(writeText).toHaveBeenCalled())
    // No "Copied!" feedback and the record call never fires.
    expect(screen.queryByText('Copied!')).toBeNull()
    expect(recordCopyFn).not.toHaveBeenCalled()
  })

  it('fires a success toast on prompt copy', async () => {
    render(<AdoptPrompt {...props} />)

    fireEvent.click(promptButton())

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith('Prompt copied', {
        description: 'Paste it into Claude Code to set up this status line.',
      }),
    )
  })

  it('does NOT toast when the clipboard rejects', async () => {
    writeText.mockRejectedValue(new Error('denied'))
    render(<AdoptPrompt {...props} />)

    fireEvent.click(promptButton())

    await waitFor(() => expect(writeText).toHaveBeenCalled())
    expect(toast).not.toHaveBeenCalled()
  })
})

describe('CopyScriptButton', () => {
  it('copies the raw source and records the copy', async () => {
    render(<CopyScriptButton source={props.source} configId={props.configId} />)

    fireEvent.click(screen.getByRole('button', { name: 'Copy script' }))

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(props.source))
    await waitFor(() =>
      expect(recordCopyFn).toHaveBeenCalledWith({
        data: { configId: 'cfg-1', kind: 'script', distinctId: 'did-test', sessionId: 'sid-test' },
      }),
    )
    // Must NOT fire a prompt toast.
    expect(toast).not.toHaveBeenCalled()
  })

  it('stays the outline variant during the "Copied!" swap (no variant flash)', async () => {
    render(<CopyScriptButton source={props.source} configId={props.configId} />)
    const button = screen.getByRole('button')
    // Outline at rest: background-only, no coral fill.
    expect(button.className).toContain('bg-background')
    expect(button.className).not.toContain('bg-primary')

    fireEvent.click(button)

    await waitFor(() => expect(screen.getByText('Copied!')).toBeTruthy())
    // Still outline while "Copied!" shows — same element, no variant flash.
    expect(button.className).toContain('bg-background')
    expect(button.className).not.toContain('bg-primary')
  })

  it('does not show "Copied!" or record when the clipboard rejects', async () => {
    writeText.mockRejectedValue(new Error('denied'))
    render(<CopyScriptButton source={props.source} configId={props.configId} />)

    fireEvent.click(screen.getByRole('button', { name: 'Copy script' }))

    await waitFor(() => expect(writeText).toHaveBeenCalled())
    expect(screen.queryByText('Copied!')).toBeNull()
    expect(recordCopyFn).not.toHaveBeenCalled()
  })
})
