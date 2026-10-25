/** A terminal cell is 0.6em wide: the Nerd Font's advance, which its fallback fonts match (font.ts). */
const CELL_EM = 0.6
/** A line is 1.32em tall: the Nerd Font's ascent plus descent, satori's normal line height. */
const LINE_EM = 1.32

/** How many pixels tall satori lays out one line of text at `fontSize`: in the Nerd Font, unless the
 * text sets its own `lineHeight` in em. */
export function lineHeight(fontSize: number, lineHeightEm = LINE_EM): number {
  return Math.round(fontSize * lineHeightEm)
}

// A terminal gives East Asian wide and fullwidth characters two cells. satori draws pictographs
// like ☀ as 1em twemoji, wider than one cell, so they count as two as well.
const WIDE =
  /[\p{Extended_Pictographic}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}　-〿！-｠￠-￦]/u
const ZERO_WIDTH = /[\p{M}‍]/u

/** How many terminal cells a line of text takes. */
export function cellWidth(text: string): number {
  let cells = 0
  for (const char of text) cells += ZERO_WIDTH.test(char) ? 0 : WIDE.test(char) ? 2 : 1
  return cells
}

/** The largest font size, up to `max`, at which every line fits in `width` pixels. A line is the
 * text of its spans: satori rounds each span's width up to a whole pixel, so each takes one more. */
export function fitFontSize(lines: string[][], max: number, width: number): number {
  const sizes = lines.map((spans) => {
    const cells = cellWidth(spans.join(''))
    return cells === 0 ? max : (width - spans.length) / (cells * CELL_EM)
  })
  // Rounded down to a hundredth, so the widest line never lands a fraction of a pixel too wide.
  return Math.floor(Math.min(max, ...sizes) * 100) / 100
}

type Size = { width: number; height: number }

/** `size` scaled up or down to fill as much of `box` as it can, keeping its aspect ratio. */
export function fitWithin(size: Size, box: Size): Size {
  const scale = Math.min(box.width / size.width, box.height / size.height)
  return { width: Math.floor(size.width * scale), height: Math.floor(size.height * scale) }
}
