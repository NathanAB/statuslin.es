// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useRecordedCopy } from '@/adopt/use-recorded-copy'

const recordCopyFn = vi.hoisted(() => vi.fn())
vi.mock('@/adopt/functions', () => ({ recordCopyFn }))

vi.mock('@posthog/react', () => ({
  usePostHog: () => ({ get_distinct_id: () => 'did-test', get_session_id: () => 'sid-test' }),
}))

const writeText = vi.fn<(text: string) => Promise<void>>()

beforeEach(() => {
  writeText.mockReset().mockResolvedValue(undefined)
  recordCopyFn.mockReset().mockResolvedValue(6)
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
    writable: true,
  })
})

describe('useRecordedCopy', () => {
  it('optimistically bumps the count on copy', async () => {
    const { result } = renderHook(() => useRecordedCopy('cfg-1', 5))
    expect(result.current.count).toBe(5)

    await act(async () => {
      result.current.copy('text', 'prompt', () => {})
    })

    await waitFor(() => expect(result.current.count).toBe(6))
  })

  it('reconciles to the server-returned count', async () => {
    recordCopyFn.mockResolvedValue(42)
    const { result } = renderHook(() => useRecordedCopy('cfg-1', 5))

    await act(async () => {
      result.current.copy('text', 'prompt', () => {})
    })

    await waitFor(() => expect(result.current.count).toBe(42))
  })

  it('does NOT regress the optimistic count when the server returns 0', async () => {
    recordCopyFn.mockResolvedValue(0)
    const { result } = renderHook(() => useRecordedCopy('cfg-1', 5))

    await act(async () => {
      result.current.copy('text', 'prompt', () => {})
    })

    // Optimistic count (5 -> 6) must hold; a 0 from the server is ignored.
    await waitFor(() => expect(recordCopyFn).toHaveBeenCalled())
    await waitFor(() => expect(result.current.count).toBe(6))
  })

  it('does not bump the count when the clipboard rejects', async () => {
    writeText.mockRejectedValue(new Error('denied'))
    const { result } = renderHook(() => useRecordedCopy('cfg-1', 5))

    await act(async () => {
      result.current.copy('text', 'prompt', () => {})
    })

    await waitFor(() => expect(writeText).toHaveBeenCalled())
    expect(recordCopyFn).not.toHaveBeenCalled()
    expect(result.current.count).toBe(5)
  })
})
