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

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

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

  it('keeps clipboard success and the optimistic count when recording rejects', async () => {
    recordCopyFn.mockRejectedValue(new Error('offline'))
    const onCopied = vi.fn()
    const { result } = renderHook(() => useRecordedCopy('cfg-1', 5))

    await act(async () => {
      result.current.copy('text', 'prompt', onCopied)
    })

    await waitFor(() => expect(recordCopyFn).toHaveBeenCalled())
    expect(onCopied).toHaveBeenCalledOnce()
    expect(result.current.count).toBe(6)
  })

  it('does not let an older response regress a newer reconciled count', async () => {
    const first = deferred<number>()
    const second = deferred<number>()
    recordCopyFn.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const { result } = renderHook(() => useRecordedCopy('cfg-1', 5))

    act(() => {
      result.current.copy('prompt', 'prompt', () => {})
      result.current.copy('script', 'script', () => {})
    })
    await waitFor(() => expect(recordCopyFn).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(result.current.count).toBe(7))

    await act(async () => second.resolve(9))
    await waitFor(() => expect(result.current.count).toBe(9))

    await act(async () => first.resolve(6))
    expect(result.current.count).toBe(9)
  })

  it('does not let a later-started lower response regress a higher authoritative count', async () => {
    const first = deferred<number>()
    const second = deferred<number>()
    recordCopyFn.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const { result } = renderHook(() => useRecordedCopy('cfg-1', 5))

    act(() => {
      result.current.copy('prompt', 'prompt', () => {})
      result.current.copy('script', 'script', () => {})
    })
    await waitFor(() => expect(recordCopyFn).toHaveBeenCalledTimes(2))

    await act(async () => first.resolve(9))
    await waitFor(() => expect(result.current.count).toBe(9))

    await act(async () => second.resolve(6))
    expect(result.current.count).toBe(9)
  })

  it('reconciles an optimistic duplicate down to the authoritative total', async () => {
    const response = deferred<number>()
    recordCopyFn.mockReturnValueOnce(response.promise)
    const { result } = renderHook(() => useRecordedCopy('cfg-1', 5))

    act(() => result.current.copy('text', 'prompt', () => {}))
    await waitFor(() => expect(result.current.count).toBe(6))

    await act(async () => response.resolve(5))
    expect(result.current.count).toBe(5)
  })

  it('resets for a new config and ignores the previous config response', async () => {
    const oldResponse = deferred<number>()
    recordCopyFn.mockReturnValueOnce(oldResponse.promise)
    const { result, rerender } = renderHook(
      ({ configId, count }) => useRecordedCopy(configId, count),
      { initialProps: { configId: 'cfg-1', count: 5 } },
    )

    act(() => result.current.copy('text', 'prompt', () => {}))
    await waitFor(() => expect(recordCopyFn).toHaveBeenCalledOnce())

    rerender({ configId: 'cfg-2', count: 2 })
    expect(result.current.count).toBe(2)

    await act(async () => oldResponse.resolve(10))
    expect(result.current.count).toBe(2)
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
