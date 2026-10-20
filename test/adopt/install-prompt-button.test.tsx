// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildClaudePrompt } from '@/adopt/install'

const getInstallSourceFn = vi.hoisted(() => vi.fn())
vi.mock('@/adopt/functions', () => ({ getInstallSourceFn }))
const onCopied = vi.fn()

const toast = vi.hoisted(() => Object.assign(vi.fn(), { error: vi.fn() }))
vi.mock('sonner', () => ({ toast }))

const { InstallPromptButton } = await import('@/adopt/install-prompt-button')

const writeText = vi.fn<(text: string) => Promise<void>>()
const SOURCES: Record<string, { title: string; source: string; interpreter: 'bash' | 'node' }> = {
  'cfg-1': { title: 'Meter', source: 'echo meter', interpreter: 'bash' },
  'cfg-2': { title: 'Pace', source: 'console.log(1)', interpreter: 'node' },
}

beforeEach(() => {
  onCopied.mockReset()
  getInstallSourceFn
    .mockReset()
    .mockImplementation(
      async ({ data }: { data: { configId: string } }) => SOURCES[data.configId] ?? null,
    )
  writeText.mockReset().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
})
afterEach(() => {
  vi.useRealTimers()
  toast.mockClear()
  toast.error.mockClear()
})

const button = (title: string) =>
  screen.getByRole('button', { name: `Copy install prompt for ${title}` })

describe('InstallPromptButton', () => {
  it("copies the status line's full install prompt, fetched when it is shown", async () => {
    render(<InstallPromptButton configId="cfg-1" title="Meter" onCopied={onCopied} />)
    await waitFor(() => expect(getInstallSourceFn).toHaveBeenCalledTimes(1))

    await act(async () => {
      fireEvent.click(button('Meter'))
    })

    expect(writeText).toHaveBeenCalledWith(
      buildClaudePrompt({ source: 'echo meter', interpreter: 'bash', title: 'Meter' }),
    )
    expect(onCopied).toHaveBeenCalledTimes(1)
    expect(toast).toHaveBeenCalledWith('Prompt copied', {
      description: 'Paste it into Claude Code to set up this status line.',
    })
    expect(screen.getByRole('button', { name: 'Copied' })).toBeTruthy()
  })

  it('keeps its width when it swaps to Copied', async () => {
    render(<InstallPromptButton configId="cfg-1" title="Meter" onCopied={onCopied} />)
    await waitFor(() => expect(getInstallSourceFn).toHaveBeenCalledTimes(1))
    await act(async () => {
      fireEvent.click(button('Meter'))
    })

    const held = screen.getByText('Copy install prompt')
    expect(held.getAttribute('aria-hidden')).toBe('true')
    expect(held.className).toContain('invisible')
  })

  it('drops its Copied timer when it unmounts', async () => {
    const { unmount } = render(
      <InstallPromptButton configId="cfg-1" title="Meter" onCopied={onCopied} />,
    )
    await waitFor(() => expect(getInstallSourceFn).toHaveBeenCalledTimes(1))
    vi.useFakeTimers()
    await act(async () => {
      fireEvent.click(button('Meter'))
    })
    expect(vi.getTimerCount()).toBe(1)

    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('fetches the next one when the status line changes, and copies that', async () => {
    const { rerender } = render(
      <InstallPromptButton configId="cfg-1" title="Meter" onCopied={onCopied} />,
    )
    rerender(<InstallPromptButton configId="cfg-2" title="Pace" onCopied={onCopied} />)
    await waitFor(() =>
      expect(getInstallSourceFn).toHaveBeenLastCalledWith({ data: { configId: 'cfg-2' } }),
    )

    await act(async () => {
      fireEvent.click(button('Pace'))
    })

    expect(writeText).toHaveBeenCalledWith(
      buildClaudePrompt({ source: 'console.log(1)', interpreter: 'node', title: 'Pace' }),
    )
  })

  it('fetches each status line once, however often it comes back', async () => {
    const { rerender } = render(
      <InstallPromptButton configId="cfg-1" title="Meter" onCopied={onCopied} />,
    )
    rerender(<InstallPromptButton configId="cfg-2" title="Pace" onCopied={onCopied} />)
    rerender(<InstallPromptButton configId="cfg-1" title="Meter" onCopied={onCopied} />)
    await waitFor(() => expect(getInstallSourceFn).toHaveBeenCalledTimes(2))
  })

  it('says so and copies nothing when the script cannot be loaded', async () => {
    render(<InstallPromptButton configId="gone" title="Gone" onCopied={onCopied} />)

    await act(async () => {
      fireEvent.click(button('Gone'))
    })

    expect(writeText).not.toHaveBeenCalled()
    expect(onCopied).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith("Couldn't load this status line's script", {
      description: 'Open its page to copy it from there.',
    })
  })
})
