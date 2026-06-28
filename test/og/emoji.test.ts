import { describe, expect, it, vi } from 'vitest'
import { emojiCodepoint, loadEmojiAsset } from '@/og/font'

describe('emojiCodepoint', () => {
  it('returns the lowercase hex codepoint of a single emoji', () => {
    expect(emojiCodepoint('🤖')).toBe('1f916')
  })
})

describe('loadEmojiAsset', () => {
  it('returns null for non-emoji segments without fetching', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    expect(await loadEmojiAsset('en', 'main')).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })
  it('fetches the twemoji svg and returns a base64 data URL for an emoji', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"></svg>'
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(svg, { status: 200 }))
    const url = await loadEmojiAsset('emoji', '🤖')
    expect(url).toMatch(/^data:image\/svg\+xml;base64,/)
    expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining('1f916.svg'), expect.anything())
    fetchSpy.mockRestore()
  })
  it('returns null when the fetch fails (skip, never hang the render)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network'))
    expect(await loadEmojiAsset('emoji', '🤖')).toBeNull()
    fetchSpy.mockRestore()
  })
})
