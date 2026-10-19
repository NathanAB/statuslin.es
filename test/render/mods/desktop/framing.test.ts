import { describe, expect, it } from 'vitest'
import { frameShot, readLayout } from '@/render/mods/desktop/framing'
import { parseRowProfile } from '@/render/mods/desktop/imagemagick'
import {
  CARD_MAX_HEIGHT,
  CHAT_TOP,
  CONTENT,
  PANE,
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

describe('frameShot with no pane open', () => {
  it('finds nothing when the shot matches the baseline', () => {
    expect(
      frameShot({
        changed: null,
        paneOpen: false,
        rows: rows(),
        plate: NO_PLATE,
      }),
    ).toEqual({ kind: 'nothing' })
  })

  it('crops the chat column from the topmost change down through the toolbar', () => {
    const frame = frameShot({
      changed: BAND,
      paneOpen: false,
      rows: BAND_ROWS,
      plate: BAND_PLATE,
    })

    expect(frame).toMatchObject({
      kind: 'crop',
      rect: { ...COLUMN, y: 767, height: CONTENT.bottom - 767 },
    })
  })

  it('cards the band itself, from its plate down to the prompt box', () => {
    const frame = frameShot({
      changed: BAND,
      paneOpen: false,
      rows: BAND_ROWS,
      plate: BAND_PLATE,
    })

    expect(frame).toMatchObject({
      card: { ...COLUMN, y: 775 - 6, height: PROMPT_BOX.y - (775 - 6) },
    })
  })

  it('finds a band by its plate even when what it draws is dark, like pixel art', () => {
    const changed = { x: 166, y: 732, width: 768, height: 81 }
    const content = rows([732, 812, 0.3], PROMPT)

    const frame = frameShot({
      changed,
      paneOpen: false,
      rows: content,
      plate: rows([732, 812, 1]),
    })

    expect(frame).toMatchObject({ card: { y: 732 - 6, height: PROMPT_BOX.y - (732 - 6) } })
  })

  it('cards a band even when chat messages above it changed too', () => {
    const changed = { x: 166, y: 300, width: 768, height: 515 }
    const profile = rows([300, 340, 0.4], [775, 814, 1], PROMPT)

    const frame = frameShot({
      changed,
      paneOpen: false,
      rows: profile,
      plate: plateOf(profile),
    })

    expect(frame).toMatchObject({ rect: { y: 292 }, card: { y: 769 } })
  })

  it('cards the prompt box and toolbar when the mod writes in the toolbar', () => {
    const changed = { x: 600, y: 300, width: 200, height: 570 }
    const profile = rows([300, 340, 0.4], PROMPT, [865, 880, 0.2])

    const frame = frameShot({
      changed,
      paneOpen: false,
      rows: profile,
      plate: plateOf(profile),
    })

    expect(frame).toMatchObject({
      card: { ...COLUMN, y: PROMPT_BOX.y - 8, height: CONTENT.bottom - (PROMPT_BOX.y - 8) },
    })
  })

  it('cards the band, prompt box and toolbar when the mod draws both', () => {
    const changed = { x: 166, y: 775, width: 768, height: 100 }
    const profile = rows([775, 814, 1], PROMPT, [865, 880, 0.2])

    const frame = frameShot({
      changed,
      paneOpen: false,
      rows: profile,
      plate: plateOf(profile),
    })

    expect(frame).toMatchObject({ card: { y: 769, height: CONTENT.bottom - 769 } })
  })

  it('cards the top of the shot when there is no band, stopping in a blank row', () => {
    const changed = { x: 166, y: 300, width: 768, height: 220 }
    const profile = rows([300, 340, 0.4], [400, 520, 0.4], PROMPT)

    const frame = frameShot({
      changed,
      paneOpen: false,
      rows: profile,
      plate: plateOf(profile),
    })

    expect(frame).toMatchObject({ card: { ...COLUMN, y: 292, height: 400 - 292 } })
  })

  it('keeps a card without a band to at most the card height', () => {
    const changed = { x: 166, y: 300, width: 768, height: 400 }
    const profile = rows([300, 700, 0.4], PROMPT)

    const frame = frameShot({
      changed,
      paneOpen: false,
      rows: profile,
      plate: plateOf(profile),
    })

    expect(frame).toMatchObject({ card: { y: 292, height: CARD_MAX_HEIGHT } })
  })

  it('starts below the element a scrolled chat cuts at its top', () => {
    const changed = { x: 166, y: CHAT_TOP + 1, width: 768, height: 700 }
    const profile = rows([CHAT_TOP + 1, CHAT_TOP + 4, 0.05], [CHAT_TOP + 11, 700, 0.3], PROMPT)

    const frame = frameShot({
      changed,
      paneOpen: false,
      rows: profile,
      plate: plateOf(profile),
    })

    expect(frame).toMatchObject({ rect: { y: CHAT_TOP + 5 } })
  })

  it('widens the crop to a change outside the chat column, such as a toast', () => {
    const toast = { x: 704, y: 471, width: 392, height: 96 }

    const frame = frameShot({
      changed: toast,
      paneOpen: false,
      rows: rows(),
      plate: NO_PLATE,
    })

    expect(frame).toMatchObject({
      rect: { x: 158, y: 463, width: SCROLL_GUTTER.x - 158, height: CONTENT.bottom - 463 },
    })
  })

  it('does not widen for a change inside the crop margin, like an antialiased band edge', () => {
    const changed = { x: 165, y: 775, width: 770, height: 40 }

    const frame = frameShot({
      changed,
      paneOpen: false,
      rows: BAND_ROWS,
      plate: BAND_PLATE,
    })

    expect(frame).toMatchObject({ rect: COLUMN })
  })

  it('never takes in the scrollbar gutter, nor anything past the window content', () => {
    const everything = { x: 0, y: 0, width: 1100, height: 900 }

    const frame = frameShot({
      changed: everything,
      paneOpen: false,
      rows: rows(),
      plate: NO_PLATE,
    })

    expect(frame).toMatchObject({
      rect: { x: CONTENT.left, y: CONTENT.top, width: SCROLL_GUTTER.x - CONTENT.left },
    })
  })
})

describe('frameShot with a pane open', () => {
  const PANE_ONLY = { x: PANE.x - 4, y: PANE.y - 4, width: PANE.width + 8, height: PANE.height + 8 }
  /** Inside the pane's border, which a card leaves out. */
  const PANE_INSIDE = { x: PANE.x + 1, width: PANE.width - 2 }
  /**
   * Published mods' panes, read across the pane's body from their production shots: the pane's
   * border and title bar, what the mod draws, and the pane's rounded bottom corners.
   */
  const paneOf = (slug: keyof typeof paneRows) => parseRowProfile(paneRows[slug], WINDOW.height)

  it.each([
    // [slug, the first and last rows the mod draws in its pane]
    ['flightdeck', 89, 357],
    ['pets', 85, 270],
    ['code-pet', 94, 178],
    ['filetree', 89, 199],
  ] as const)('cards all that %s draws in its pane, leaving out the chat', (slug, first, last) => {
    const frame = frameShot({
      changed: null,
      paneOpen: true,
      rows: rows(),
      plate: NO_PLATE,
      pane: paneOf(slug),
    })

    expect(frame).toMatchObject({
      card: { ...PANE_INSIDE, y: first - 8, height: last + 1 + 8 - (first - 8) },
    })
  })

  it('crops and cards the pane alone, leaving out the chat beside it', () => {
    const frame = frameShot({
      changed: null,
      paneOpen: true,
      rows: rows(),
      plate: NO_PLATE,
      pane: paneOf('flightdeck'),
    })

    expect(frame).toMatchObject({ rect: PANE_ONLY, card: { ...PANE_INSIDE, y: 81 } })
  })

  it('cuts a pane too tall for a card at a blank row', () => {
    const pane = rows([100, 200, 0.4], [210, 700, 0.4])

    const frame = frameShot({
      changed: null,
      paneOpen: true,
      rows: rows(),
      plate: NO_PLATE,
      pane,
    })

    expect(frame).toMatchObject({ card: { y: 92, height: 210 - 92 } })
  })

  it('cards the pane top when nothing shows in its body', () => {
    expect(
      frameShot({
        changed: null,
        paneOpen: true,
        rows: rows(),
        plate: NO_PLATE,
        pane: rows([40, 64, 0.2]),
      }),
    ).toEqual({
      kind: 'crop',
      rect: PANE_ONLY,
      card: { ...PANE_ONLY, height: CARD_MAX_HEIGHT },
    })
  })

  it('cards a band above the narrowed prompt box, over the pane', () => {
    const frame = frameShot({
      changed: null,
      paneOpen: true,
      rows: BAND_ROWS,
      plate: BAND_PLATE,
      pane: paneOf('pets'),
    })

    expect(frame).toMatchObject({
      card: { x: 33, y: 769, width: 701 - 33, height: PROMPT_BOX.y - 769 },
    })
  })
})

const grey = (mean: number, deviation = 0) => ({ mean, deviation })
const BACKGROUND = 20 / 255

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
