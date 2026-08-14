// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AdoptPrompt } from '@/adopt/adopt-actions'
import { buildClaudePrompt } from '@/adopt/install'
import { useRecordedCopy } from '@/adopt/use-recorded-copy'
import { HighlightedCode } from '@/ui/highlighted-code'

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

const SOURCE_HTML = '<pre class="shiki"><code>echo hi</code></pre>'

// The prompt button's accessible name is its (stable) aria-label, which keeps the
// visible "Copy install prompt" text inside it (WCAG label-in-name).
const promptButton = () =>
  screen.getByRole('button', { name: 'Copy install prompt — My Statusline' })

function SharedCopyActions() {
  const controller = useRecordedCopy(props.configId, props.copyCount)
  return (
    <>
      <AdoptPrompt
        source={props.source}
        interpreter={props.interpreter}
        title={props.title}
        controller={controller}
      />
      <HighlightedCode
        html={SOURCE_HTML}
        text={props.source}
        copyLabel="Copy script"
        onCopied={() => controller.record('script')}
      />
    </>
  )
}

function PromptHarness() {
  const controller = useRecordedCopy(props.configId, props.copyCount)
  return (
    <AdoptPrompt
      source={props.source}
      interpreter={props.interpreter}
      title={props.title}
      controller={controller}
    />
  )
}

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
  it('shares one reconciled count across prompt and source-overlay copy', async () => {
    let resolveScriptCopy!: (count: number) => void
    const scriptCopy = new Promise<number>((resolve) => {
      resolveScriptCopy = resolve
    })
    recordCopyFn.mockResolvedValueOnce(6).mockReturnValueOnce(scriptCopy)
    render(<SharedCopyActions />)

    fireEvent.click(promptButton())
    await waitFor(() => expect(screen.getByText('6 copies')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'Copy script' }))
    await waitFor(() => expect(recordCopyFn).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.getByText('7 copies')).toBeTruthy())

    resolveScriptCopy(6)
    await waitFor(() => expect(screen.getByText('6 copies')).toBeTruthy())
  })

  it('renders a coral lg "Copy install prompt" button', () => {
    render(<PromptHarness />)
    expect(screen.getByText('Copy install prompt')).toBeTruthy()
    // Coral (default/primary variant) at the large size.
    expect(promptButton().className).toContain('bg-primary')
    expect(promptButton().getAttribute('data-size')).toBe('lg')
  })

  it('copies the built Claude prompt and records the copy', async () => {
    render(<PromptHarness />)

    fireEvent.click(promptButton())

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(buildClaudePrompt(props))
    })
    await waitFor(() => expect(recordCopyFn).toHaveBeenCalled())
  })

  it('does not show "Copied!" or record when the clipboard rejects', async () => {
    writeText.mockRejectedValue(new Error('denied'))
    render(<PromptHarness />)

    fireEvent.click(promptButton())

    await waitFor(() => expect(writeText).toHaveBeenCalled())
    // No "Copied!" feedback and the record call never fires.
    expect(screen.queryByText('Copied!')).toBeNull()
    expect(recordCopyFn).not.toHaveBeenCalled()
  })

  it('fires a success toast on prompt copy', async () => {
    render(<PromptHarness />)

    fireEvent.click(promptButton())

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith('Prompt copied', {
        description: 'Paste it into Claude Code to set up this status line.',
      }),
    )
  })

  it('does NOT toast when the clipboard rejects', async () => {
    writeText.mockRejectedValue(new Error('denied'))
    render(<PromptHarness />)

    fireEvent.click(promptButton())

    await waitFor(() => expect(writeText).toHaveBeenCalled())
    expect(toast).not.toHaveBeenCalled()
  })
})

describe('config source overlay', () => {
  it('copies the raw source and records kind script, without a prompt toast', async () => {
    render(<SharedCopyActions />)

    fireEvent.click(screen.getByRole('button', { name: 'Copy script' }))

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(props.source))
    await waitFor(() =>
      expect(recordCopyFn).toHaveBeenCalledWith({
        data: { configId: 'cfg-1', kind: 'script', distinctId: 'did-test', sessionId: 'sid-test' },
      }),
    )
    expect(toast).not.toHaveBeenCalled()
  })
})
