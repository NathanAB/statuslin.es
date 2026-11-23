import { describe, expect, it } from 'vitest'
import { frameChat, framePane, readLayout, readScrolled } from '@/render/mods/desktop/framing'
import { parseRowProfile } from '@/render/mods/desktop/imagemagick'
import {
  CARD_MAX_HEIGHT,
  CONTENT,
  PANE_BORDER_GREY,
  PROMPT_BORDER_GREY,
  PROMPT_BOX,
  SCROLL_GUTTER,
  WINDOW,
} from '@/render/mods/desktop/screen'
import paneRows from '../fixtures/desktop-pane-rows.json'

/** A shot's row profile: 0 (page background) everywhere except the given [from, to, share] runs. */
function rows(...runs: [number, number, number][]): number[] {
  const profile = Array<number>(WINDOW.height).fill(0)
  for (const [from, to, share] of runs) profile.fill(share, from, to + 1)
  return profile
}

/** The band plate in a test profile: its rows that are full, which a plate always is. */
const plateOf = (profile: number[]) =>
  profile.map((share, y) => (share === 1 && y < PROMPT_BOX.y ? 1 : 0))

const PROMPT = [PROMPT_BOX.y, PROMPT_BOX.y + PROMPT_BOX.height - 1, 1] as [number, number, number]
const BAND_ROWS = rows([775, 814, 1], PROMPT)
const BAND_PLATE = rows([775, 814, 1])
const NO_PLATE = rows()
const BAND = { x: 166, y: 775, width: 768, height: 40 }
const COLUMN = { x: 158, width: 784 }
const PROMPT_BOTTOM = PROMPT_BOX.y + PROMPT_BOX.height

describe('frameChat', () => {
  it('crops the chat column from the topmost change down through the toolbar', () => {
    const frame = frameChat({
      changed: BAND,
      rows: BAND_ROWS,
      plate: BAND_PLATE,
      restylesPrompt: false,
      scrolled: false,
    })

    expect(frame).toMatchObject({
      rect: { ...COLUMN, y: 767, height: CONTENT.bottom - 767 },
    })
  })

  it('cards the band itself, from its plate down to the prompt box', () => {
    const frame = frameChat({
      changed: BAND,
      rows: BAND_ROWS,
      plate: BAND_PLATE,
      restylesPrompt: false,
      scrolled: false,
    })

    expect(frame).toMatchObject({
      card: { ...COLUMN, y: 775 - 6, height: PROMPT_BOX.y - (775 - 6) },
    })
  })

  it('finds a band by its plate even when what it draws is dark, like pixel art', () => {
    const changed = { x: 166, y: 732, width: 768, height: 81 }
    const content = rows([732, 812, 0.3], PROMPT)

    const frame = frameChat({
      changed,
      rows: content,
      plate: rows([732, 812, 1]),
      restylesPrompt: false,
      scrolled: false,
    })

    expect(frame).toMatchObject({ card: { y: 732 - 6, height: PROMPT_BOX.y - (732 - 6) } })
  })

  it('cards a band even when chat messages above it changed too', () => {
    const changed = { x: 166, y: 300, width: 768, height: 515 }
    const profile = rows([300, 340, 0.4], [775, 814, 1], PROMPT)

    const frame = frameChat({
      changed,
      rows: profile,
      plate: plateOf(profile),
      restylesPrompt: false,
      scrolled: false,
    })

    expect(frame).toMatchObject({ rect: { y: 292 }, card: { y: 769 } })
  })

  it('cards the prompt box and toolbar when the mod writes in the toolbar', () => {
    const changed = { x: 600, y: 300, width: 200, height: 570 }
    const profile = rows([300, 340, 0.4], PROMPT, [865, 880, 0.2])

    const frame = frameChat({
      changed,
      rows: profile,
      plate: plateOf(profile),
      restylesPrompt: false,
      scrolled: false,
    })

    expect(frame).toMatchObject({
      card: { ...COLUMN, y: PROMPT_BOX.y - 8, height: CONTENT.bottom - (PROMPT_BOX.y - 8) },
    })
  })

  it('cards the band, prompt box and toolbar when the mod draws both', () => {
    const changed = { x: 166, y: 775, width: 768, height: 100 }
    const profile = rows([775, 814, 1], PROMPT, [865, 880, 0.2])

    const frame = frameChat({
      changed,
      rows: profile,
      plate: plateOf(profile),
      restylesPrompt: false,
      scrolled: false,
    })

    expect(frame).toMatchObject({ card: { y: 769, height: CONTENT.bottom - 769 } })
  })

  it('cards the band down through the prompt box when the mod restyled its text', () => {
    const frame = frameChat({
      changed: BAND,
      rows: BAND_ROWS,
      plate: BAND_PLATE,
      restylesPrompt: true,
      scrolled: false,
    })

    expect(frame).toMatchObject({ card: { ...COLUMN, y: 769, height: PROMPT_BOTTOM + 6 - 769 } })
  })

  it('cards the prompt box alone when the mod restyled its text and drew no band', () => {
    const changed = { x: 166, y: 300, width: 768, height: 41 }
    const profile = rows([300, 340, 0.4], PROMPT)

    const frame = frameChat({
      changed,
      rows: profile,
      plate: plateOf(profile),
      restylesPrompt: true,
      scrolled: false,
    })

    expect(frame).toMatchObject({
      card: { ...COLUMN, y: PROMPT_BOX.y - 8, height: PROMPT_BOTTOM + 6 - (PROMPT_BOX.y - 8) },
    })
  })

  it('cards the top of the shot when there is no band, stopping in a blank row', () => {
    const changed = { x: 166, y: 300, width: 768, height: 220 }
    const profile = rows([300, 340, 0.4], [400, 520, 0.4], PROMPT)

    const frame = frameChat({
      changed,
      rows: profile,
      plate: plateOf(profile),
      restylesPrompt: false,
      scrolled: false,
    })

    expect(frame).toMatchObject({ card: { ...COLUMN, y: 292, height: 400 - 292 } })
  })

  it('keeps a card without a band to at most the card height', () => {
    const changed = { x: 166, y: 300, width: 768, height: 400 }
    const profile = rows([300, 700, 0.4], PROMPT)

    const frame = frameChat({
      changed,
      rows: profile,
      plate: plateOf(profile),
      restylesPrompt: false,
      scrolled: false,
    })

    expect(frame).toMatchObject({ card: { y: 292, height: CARD_MAX_HEIGHT } })
  })

  it('starts below the element a scrolled chat cuts at its top', () => {
    // Desktop 6.28899.6 fades a scrolled chat's top, so the cut element shows from row 57.
    const changed = { x: 166, y: 57, width: 768, height: 700 }
    const profile = rows([57, 72, 0.05], [78, 90, 0.1], [164, 700, 0.3], PROMPT)

    const frame = frameChat({
      changed,
      rows: profile,
      plate: plateOf(profile),
      restylesPrompt: false,
      scrolled: true,
    })

    expect(frame).toMatchObject({ rect: { y: 91 } })
  })

  it('widens the crop to a change outside the chat column, such as a toast', () => {
    const toast = { x: 704, y: 471, width: 392, height: 96 }

    const frame = frameChat({
      changed: toast,
      rows: rows(),
      plate: NO_PLATE,
      restylesPrompt: false,
      scrolled: false,
    })

    expect(frame).toMatchObject({
      rect: { x: 158, y: 463, width: SCROLL_GUTTER.x - 158, height: CONTENT.bottom - 463 },
    })
  })

  it('does not widen for a change inside the crop margin, like an antialiased band edge', () => {
    const changed = { x: 165, y: 775, width: 770, height: 40 }

    const frame = frameChat({
      changed,
      rows: BAND_ROWS,
      plate: BAND_PLATE,
      restylesPrompt: false,
      scrolled: false,
    })

    expect(frame).toMatchObject({ rect: COLUMN })
  })

  it('never takes in the scrollbar gutter, nor anything past the window content', () => {
    const everything = { x: 0, y: 0, width: 1100, height: 900 }

    const frame = frameChat({
      changed: everything,
      rows: rows(),
      plate: NO_PLATE,
      restylesPrompt: false,
      scrolled: false,
    })

    expect(frame).toMatchObject({
      rect: { x: CONTENT.left, y: CONTENT.top, width: SCROLL_GUTTER.x - CONTENT.left },
    })
  })
})

describe('framePane', () => {
  /** The pane and the crop margin around it, inside the window: the pane runs to its edges. */
  const PANE_ONLY = { x: 729, y: 33, width: 371, height: 867 }
  const PANE_RIGHT_OF_BORDER = { x: 734, width: 366 }
  /**
   * Curated mods' panes, read across the pane's body from Desktop 6.28899.6 shots in the recording
   * sandbox: the session header, the pane's title bar, then what the mod draws.
   */
  const paneOf = (slug: keyof typeof paneRows) => parseRowProfile(paneRows[slug], WINDOW.height)

  it.each([
    { slug: 'flightdeck', firstDrawn: 101, cardEndsAtBlankRow: 293 },
    { slug: 'pets', firstDrawn: 97, lastDrawn: 283 },
    { slug: 'code-pet', firstDrawn: 111, lastDrawn: 195 },
    { slug: 'filetree', firstDrawn: 102, cardEndsAtBlankRow: 384 },
  ] as const)('cards what $slug draws in its pane, leaving out the chat', (row) => {
    const { slug, firstDrawn } = row
    const top = firstDrawn - 8
    const bottom = 'lastDrawn' in row ? row.lastDrawn + 1 + 8 : row.cardEndsAtBlankRow
    const frame = framePane(paneOf(slug))

    expect(frame).toMatchObject({ card: { ...PANE_RIGHT_OF_BORDER, y: top, height: bottom - top } })
  })

  it('crops and cards the pane alone, leaving out the chat beside it', () => {
    const frame = framePane(paneOf('flightdeck'))

    expect(frame).toMatchObject({ rect: PANE_ONLY, card: { ...PANE_RIGHT_OF_BORDER, y: 93 } })
  })

  it('cuts a pane too tall for a card at a blank row', () => {
    const pane = rows([100, 200, 0.4], [210, 700, 0.4])

    const frame = framePane(pane)

    expect(frame).toMatchObject({ card: { y: 92, height: 210 - 92 } })
  })

  it('cards the pane top when nothing shows in its body', () => {
    expect(framePane(rows([37, 80, 0.2]))).toEqual({
      rect: PANE_ONLY,
      card: { ...PANE_ONLY, height: CARD_MAX_HEIGHT },
    })
  })
})

const grey = (mean: number, deviation = 0) => ({ mean, deviation })
const BACKGROUND = 25 / 255

describe('readLayout', () => {
  it('sees the chat column alone when the prompt box border is where it is with no pane', () => {
    const layout = readLayout({
      prompt: grey(PROMPT_BORDER_GREY),
      promptBesidePane: grey(BACKGROUND),
      pane: grey(0.3, 0.2),
    })

    expect(layout).toBe('chat')
  })

  it('sees a pane when its border and the narrowed prompt box border are both there', () => {
    const layout = readLayout({
      prompt: grey(0.1, 0.05),
      promptBesidePane: grey(PROMPT_BORDER_GREY),
      pane: grey(PANE_BORDER_GREY),
    })

    expect(layout).toBe('pane')
  })

  it('refuses a shot that matches neither layout, as after a Desktop upgrade', () => {
    const shot = { prompt: grey(BACKGROUND), promptBesidePane: grey(BACKGROUND), pane: grey(0) }

    expect(() => readLayout(shot)).toThrow(/screen\.ts/)
  })

  it('does not take a textured column for a border', () => {
    const shot = {
      prompt: grey(PROMPT_BORDER_GREY, 0.1),
      promptBesidePane: grey(PROMPT_BORDER_GREY, 0.1),
      pane: grey(PANE_BORDER_GREY, 0.1),
    }

    expect(() => readLayout(shot)).toThrow(/screen\.ts/)
  })
})

describe('readScrolled', () => {
  it("sees a scrolled chat where Desktop draws its scrollbar's foot", () => {
    expect(readScrolled(grey(50 / 255, 0.1))).toBe(true)
  })

  it('sees a chat that fits where that strip is page background', () => {
    expect(readScrolled(grey(25 / 255))).toBe(false)
  })
})
