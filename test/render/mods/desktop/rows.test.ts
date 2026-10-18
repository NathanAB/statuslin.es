import { describe, expect, it } from 'vitest'
import {
  bandAbovePrompt,
  cardBottom,
  drawnRows,
  emptyRows,
  GAP_COLLAPSE_OVER,
  gapCuts,
  KEPT_GAP,
  uncutTop,
} from '@/render/mods/desktop/rows'
import { CARD_MAX_HEIGHT, CHAT_TOP, WINDOW } from '@/render/mods/desktop/screen'

/** A shot's row profile: 0 (page background) everywhere except the given [from, to, share] runs. */
function rows(...runs: [number, number, number][]): number[] {
  const profile = Array<number>(WINDOW.height).fill(0)
  for (const [from, to, share] of runs) profile.fill(share, from, to + 1)
  return profile
}

const PROMPT_TOP = 821

describe('bandAbovePrompt', () => {
  it('finds the plate Desktop draws a band on, just above the prompt box', () => {
    const profile = rows([775, 814, 1], [PROMPT_TOP, 860, 1])

    expect(bandAbovePrompt(profile, PROMPT_TOP)).toEqual({ top: 775, bottom: 814 })
  })

  it('keeps a rounded corner row, which is nearly full', () => {
    const profile = rows([775, 775, 0.97], [776, 814, 1])

    expect(bandAbovePrompt(profile, PROMPT_TOP)).toEqual({ top: 775, bottom: 814 })
  })

  it('finds no band when only chat text sits above the prompt box', () => {
    const profile = rows([600, 615, 0.3], [PROMPT_TOP, 860, 1])

    expect(bandAbovePrompt(profile, PROMPT_TOP)).toBeNull()
  })

  it('does not take a full-width block higher up the chat for a band', () => {
    const profile = rows([700, 760, 1])

    expect(bandAbovePrompt(profile, PROMPT_TOP)).toBeNull()
  })

  it('ignores a sliver too thin to be a band', () => {
    expect(bandAbovePrompt(rows([812, 814, 1]), PROMPT_TOP)).toBeNull()
  })
})

describe('uncutTop', () => {
  it('leaves a top that sits in a blank row', () => {
    expect(uncutTop(rows([300, 340, 0.4]), 292)).toBe(292)
  })

  it('moves a top that lands inside a row of content up to the blank row above it', () => {
    expect(uncutTop(rows([300, 340, 0.4]), 320)).toBe(299)
  })

  it('drops the element the scrolled chat cut at its top, starting at the gap after it', () => {
    const profile = rows([CHAT_TOP + 1, CHAT_TOP + 4, 0.05], [CHAT_TOP + 11, CHAT_TOP + 24, 0.3])

    expect(uncutTop(profile, CHAT_TOP - 7)).toBe(CHAT_TOP + 5)
  })

  it('keeps a lower top when the cut element is above it anyway', () => {
    const profile = rows([CHAT_TOP + 1, CHAT_TOP + 4, 0.05], [400, 420, 0.3])

    expect(uncutTop(profile, 392)).toBe(392)
  })

  it('does not treat a chat that starts well below its top as scrolled', () => {
    expect(uncutTop(rows([125, 160, 0.2]), 117)).toBe(117)
  })
})

describe('cardBottom', () => {
  it('ends the card at its height limit when that row is blank', () => {
    expect(cardBottom(rows([300, 340, 0.4]), 292, 896)).toBe(292 + CARD_MAX_HEIGHT)
  })

  it('ends the card at the blank row above content it would cut', () => {
    const profile = rows([300, 340, 0.4], [400, 460, 0.4])

    expect(cardBottom(profile, 292, 896)).toBe(400)
  })

  it('cuts at the limit when one element fills the whole card', () => {
    expect(cardBottom(rows([290, 600, 0.4]), 292, 896)).toBe(292 + CARD_MAX_HEIGHT)
  })

  it('never runs past the shot', () => {
    expect(cardBottom(rows(), 800, 896)).toBe(896)
  })

  it('takes a taller limit for a card that has room for one', () => {
    const profile = rows([300, 340, 0.4], [400, 460, 0.4], [480, 600, 0.4])

    expect(cardBottom(profile, 292, 896, 250)).toBe(480)
  })
})

describe('drawnRows', () => {
  it('finds the first and last rows that hold anything between two rows', () => {
    const profile = rows([50, 60, 1], [93, 103, 0.3], [127, 361, 0.8], [880, 887, 1])

    expect(drawnRows(profile, 76, 876)).toEqual({ top: 93, bottom: 361 })
  })

  it('finds nothing when every row between them is blank', () => {
    expect(drawnRows(rows([50, 60, 1]), 76, 876)).toBeNull()
  })
})
describe('emptyRows', () => {
  it('is a row only when it is page background and the same as in the baseline', () => {
    const content = [0, 0.3, 0, 0]
    const changed = [0, 0, 0.1, 0]

    expect(emptyRows(content, changed)).toEqual([true, false, false, true])
  })
})

describe('gapCuts', () => {
  /** Empty everywhere except the given [from, to] runs of rows that have something in them. */
  const empty = (...filled: [number, number][]) => {
    const flags = Array<boolean>(WINDOW.height).fill(true)
    for (const [from, to] of filled) flags.fill(false, from, to + 1)
    return flags
  }

  it('cuts a long empty stretch down to the gap Desktop leaves between messages', () => {
    const flags = empty([300, 340], [740, 896])

    expect(gapCuts(flags, 292, 896)).toEqual([
      { from: 341 + KEPT_GAP / 2, rows: 740 - 341 - KEPT_GAP },
    ])
  })

  it('leaves the space between messages alone', () => {
    expect(gapCuts(empty([300, 340], [392, 430], [740, 896]), 292, 896)).toEqual([
      { from: 431 + KEPT_GAP / 2, rows: 740 - 431 - KEPT_GAP },
    ])
  })

  it('collapses only a stretch longer than the threshold', () => {
    const at = (length: number) => gapCuts(empty([300, 340], [341 + length, 896]), 292, 896)

    expect(at(GAP_COLLAPSE_OVER)).toEqual([])
    expect(at(GAP_COLLAPSE_OVER + 1)).toHaveLength(1)
  })

  it('cuts every long stretch, top to bottom', () => {
    const cuts = gapCuts(empty([300, 310], [500, 510], [800, 896]), 292, 896)

    expect(cuts.map((c) => c.from)).toEqual([311 + KEPT_GAP / 2, 511 + KEPT_GAP / 2])
  })

  it('looks only inside the crop', () => {
    expect(gapCuts(empty([700, 896]), 650, 896)).toEqual([])
  })
})
