import { afterEach, describe, expect, it, vi } from 'vitest'
import { createEmojiLoader, emojiCodepoint, MAX_EMOJI_FETCHES_PER_RENDER } from '@/og/font'

const SVG = '<svg xmlns="http://www.w3.org/2000/svg"></svg>'

function fakeFetch() {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(SVG))
}

/** Distinct emoji per test: the loader memoizes fetched SVGs for the life of the process. */
function emojiFrom(first: number, count: number): string[] {
  return Array.from({ length: count }, (_, i) => String.fromCodePoint(first + i))
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('emojiCodepoint', () => {
  it('returns the lowercase hex codepoint of a single emoji', () => {
    expect(emojiCodepoint('🤖')).toBe('1f916')
  })
})

describe('createEmojiLoader', () => {
  it('returns null for non-emoji segments without fetching', async () => {
    const fetchSpy = fakeFetch()
    expect(await createEmojiLoader()('en', 'main')).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('fetches the twemoji svg and returns a base64 data URL for an emoji', async () => {
    const fetchSpy = fakeFetch()
    const url = await createEmojiLoader()('emoji', '🤖')
    expect(url).toMatch(/^data:image\/svg\+xml;base64,/)
    expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining('1f916.svg'), expect.anything())
  })

  it('returns null when the fetch fails (skip, never hang the render), and retries next time', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('network'))
    expect(await createEmojiLoader()('emoji', '🛰')).toBeNull()

    fetchSpy.mockResolvedValueOnce(new Response(SVG))
    expect(await createEmojiLoader()('emoji', '🛰')).toMatch(/^data:image\/svg\+xml;base64,/)
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('fetches each emoji once across renders', async () => {
    const fetchSpy = fakeFetch()
    const [emoji = ''] = emojiFrom(0x1f400, 1)

    const first = await createEmojiLoader()('emoji', emoji)
    const second = await createEmojiLoader()('emoji', emoji)

    expect(second).toBe(first)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('stops fetching past the per-render cap and skips the rest', async () => {
    const fetchSpy = fakeFetch()
    const load = createEmojiLoader()
    const emoji = emojiFrom(0xe000, 450)

    const urls = await Promise.all(emoji.map((e) => load('emoji', e)))

    expect(fetchSpy).toHaveBeenCalledTimes(MAX_EMOJI_FETCHES_PER_RENDER)
    expect(urls.filter((u) => u !== null)).toHaveLength(MAX_EMOJI_FETCHES_PER_RENDER)
  })

  it('still serves an already-fetched emoji past the cap', async () => {
    const fetchSpy = fakeFetch()
    const [cached = '', ...fresh] = emojiFrom(0x1f500, MAX_EMOJI_FETCHES_PER_RENDER + 1)
    await createEmojiLoader()('emoji', cached)
    const load = createEmojiLoader()
    await Promise.all(fresh.map((e) => load('emoji', e)))

    expect(await load('emoji', cached)).toMatch(/^data:image\/svg\+xml;base64,/)
    expect(fetchSpy).toHaveBeenCalledTimes(MAX_EMOJI_FETCHES_PER_RENDER + 1)
  })
})
