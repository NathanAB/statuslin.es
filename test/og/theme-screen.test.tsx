import { describe, expect, it } from 'vitest'
import { OG_PALETTE } from '@/og/palette'
import { drawThemeScreen } from '@/og/theme-screen'
import type { AnsiSegment } from '@/render/types'

const BOX = { width: 500, height: 300 }

type Drawn = { text: string; color: unknown; background: unknown }

/** Every run of text the screen draws, with the colors its element sets. */
function spans(node: unknown): Drawn[] {
  if (Array.isArray(node)) return node.flatMap(spans)
  if (!node || typeof node !== 'object' || !('props' in node)) return []
  const { props } = node as {
    props: { children?: unknown; style?: { color?: unknown; background?: unknown } }
  }
  if (typeof props.children === 'string') {
    return [
      { text: props.children, color: props.style?.color, background: props.style?.background },
    ]
  }
  return spans(props.children)
}

/** The background the screen's well is drawn on. */
const wellBackground = (node: unknown) =>
  (node as { props: { style: { background: unknown } } }).props.style.background

describe('drawThemeScreen', () => {
  it("draws each segment's own background as well as its color", () => {
    const segments: AnsiSegment[] = [
      { text: '❯ hello', fg: 'rgb(119, 136, 153)', bg: 'rgb(55, 55, 55)' },
      { text: ' done', fg: 'rgb(255, 255, 255)' },
    ]

    expect(spans(drawThemeScreen({ segments, window: 'dark' }, BOX))).toEqual([
      { text: '❯ hello', color: 'rgb(119, 136, 153)', background: 'rgb(55, 55, 55)' },
      { text: ' done', color: 'rgb(255, 255, 255)', background: undefined },
    ])
  })

  // As on the site (src/ui/theme-preview.tsx): a light theme sits in a light window, the site's
  // colors swapped, and a dark one in the dark well.
  it("draws a light theme in a light window, its default text in the window's ink", () => {
    const screen = drawThemeScreen({ segments: [{ text: 'plain' }], window: 'light' }, BOX)

    expect(wellBackground(screen)).toBe(OG_PALETTE.foreground)
    expect(spans(screen)).toEqual([
      { text: 'plain', color: OG_PALETTE.background, background: undefined },
    ])
  })

  it("draws a dark theme in the dark well, its default text in the window's ink", () => {
    const screen = drawThemeScreen({ segments: [{ text: 'plain' }], window: 'dark' }, BOX)

    expect(wellBackground(screen)).toBe(OG_PALETTE.sunken)
    expect(spans(screen)).toEqual([
      { text: 'plain', color: OG_PALETTE.foreground, background: undefined },
    ])
  })

  // A recorded screen has a run of empty rows between the conversation and the prompt; at one row
  // each, the screen keeps a larger size in a card's short body.
  it('draws a run of empty rows as one', () => {
    const screen = drawThemeScreen(
      { segments: [{ text: 'top\n\n\n\n\nbottom' }], window: 'dark' },
      BOX,
    )

    expect(spans(screen).map((s) => s.text)).toEqual(['top', ' ', 'bottom'])
  })
})
