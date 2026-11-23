import type { ReactElement } from 'react'
import { fitFontSize, fitRowsFontSize } from '@/og/fit'
import { MONO_FONT } from '@/og/font'
import { OG_PALETTE } from '@/og/palette'
import { splitSegmentsIntoLines } from '@/og/split-lines'
import type { AnsiSegment } from '@/render/types'
import type { ThemeWindow } from '@/themes/theme'

/** A terminal theme's recorded screen and the window it was made for. */
export type ThemeScreen = { segments: AnsiSegment[]; window: ThemeWindow }

// The window a theme is drawn in, as the site draws it (src/ui/theme-preview.tsx): a light theme in
// the site's colors swapped, a dark one in the dark well. Text the theme leaves in the terminal's
// default colors takes the window's ink.
const WINDOW: Record<ThemeWindow, { background: string; ink: string }> = {
  light: { background: OG_PALETTE.foreground, ink: OG_PALETTE.background },
  dark: { background: OG_PALETTE.sunken, ink: OG_PALETTE.foreground },
}

const SCREEN_PADDING = 12
// No larger than a status line preview's text on a card.
const SCREEN_MAX_FONT_SIZE = 19

/** The screen's rows, a run of empty rows kept as one: they hold no color, only height. */
function screenRows(segments: AnsiSegment[]): AnsiSegment[][] {
  return splitSegmentsIntoLines(segments).filter(
    (row, i, rows) => row.length > 0 || rows[i - 1]?.length !== 0,
  )
}

/**
 * A theme's whole recorded screen in its window, every row in sight: the text shrinks until the
 * widest row fits `box`'s width and every row its height, padding included. Each segment draws its
 * own background as well as its color, since a theme colors both.
 */
export function drawThemeScreen(
  screen: ThemeScreen,
  box: { width: number; height: number },
): ReactElement {
  const { background, ink } = WINDOW[screen.window]
  const rows = screenRows(screen.segments)
  const fontSize = Math.min(
    fitFontSize(
      rows.map((row) => row.map((s) => s.text)),
      SCREEN_MAX_FONT_SIZE,
      box.width - 2 * SCREEN_PADDING,
    ),
    fitRowsFontSize(rows.length, SCREEN_MAX_FONT_SIZE, box.height - 2 * SCREEN_PADDING),
  )
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        background,
        borderRadius: 10,
        padding: SCREEN_PADDING,
        fontFamily: MONO_FONT,
        fontSize,
      }}
    >
      {rows.map((row, ri) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: a fixed recorded screen, ordered, with no ids.
          key={ri}
          style={{ display: 'flex', whiteSpace: 'pre' }}
        >
          {row.length === 0 ? (
            // An empty row keeps its height: satori collapses a truly empty row to 0px.
            <span> </span>
          ) : (
            row.map((s, i) => (
              <span
                // biome-ignore lint/suspicious/noArrayIndexKey: a fixed recorded screen, ordered, with no ids.
                key={i}
                style={{
                  color: s.fg ?? ink,
                  background: s.bg ?? undefined,
                  fontWeight: s.bold ? 700 : 400,
                }}
              >
                {s.text}
              </span>
            ))
          )}
        </div>
      ))}
    </div>
  )
}
