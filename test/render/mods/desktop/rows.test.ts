import { describe, expect, it } from 'vitest'
import { SIGNATURE_CELLS } from '@/render/mods/desktop/imagemagick'
import {
  bandAbovePrompt,
  cardBottom,
  drawnRows,
  KEPT_GAP,
  keptRowCuts,
  promptTop,
  rowsNotInBaseline,
  SIGNATURE_TOLERANCE,
  uncutTop,
  userBubbleRows,
  wholeElements,
} from '@/render/mods/desktop/rows'
import {
  CARD_MAX_HEIGHT,
  CHAT_TOP,
  CROP_MARGIN,
  PROMPT_BOX,
  WINDOW,
} from '@/render/mods/desktop/screen'

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

// Plate rows measured on Desktop 2.42304.2: a one-line prompt box reads from 830, a box holding a
// draft that wrapped to two lines from 810, both down to 859.
describe('promptTop', () => {
  it('is the prompt box top when the draft fits on one line', () => {
    expect(promptTop(rows([830, 859, 1]))).toBe(PROMPT_BOX.y)
  })

  it('moves up with the box when a draft wraps to more lines', () => {
    expect(promptTop(rows([810, 859, 1]))).toBe(PROMPT_BOX.y - 20)
  })

  it('stays at the prompt box top when no box reads in the plate', () => {
    expect(promptTop(rows())).toBe(PROMPT_BOX.y)
  })

  it('lets the band above a two-line draft be found', () => {
    const profile = rows([763, 794, 1], [810, 859, 1])

    expect(bandAbovePrompt(profile, promptTop(profile))).toEqual({ top: 763, bottom: 794 })
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
describe('userBubbleRows', () => {
  it("is a row of a message the user sent: on the column's right edge, clear of its left", () => {
    const left = [0, 0, 0.5, 1, 0]
    const right = [0, 0.4, 0, 1, 0.4]

    expect(userBubbleRows(left, right)).toEqual([false, true, false, false, true])
  })
})

describe('wholeElements', () => {
  it('spreads each marked row to the element it is in, from blank row to blank row', () => {
    const profile = rows([10, 20, 0.4], [30, 40, 0.4])
    const marked = profile.map((_, y) => y === 15)

    const spread = wholeElements(marked, profile)

    expect(spread.flatMap((m, y) => (m ? [y] : []))).toEqual(
      Array.from({ length: 11 }, (_, i) => 10 + i),
    )
  })
})

describe('keptRowCuts', () => {
  /** Kept only on the given [from, to] runs of rows. */
  const kept = (...runs: [number, number][]) => {
    const flags = Array<boolean>(WINDOW.height).fill(false)
    for (const [from, to] of runs) flags.fill(true, from, to + 1)
    return flags
  }

  it('cuts everything above and below what is kept, down to the crop margin', () => {
    expect(keptRowCuts(kept([775, 814]), 292, 896)).toEqual([
      { from: 292, rows: 775 - CROP_MARGIN - 292 },
      { from: 815 + CROP_MARGIN, rows: 896 - (815 + CROP_MARGIN) },
    ])
  })

  it('cuts a stretch between kept rows down to the gap it keeps', () => {
    const cuts = keptRowCuts(kept([300, 340], [775, 814]), 300, 815)

    expect(cuts).toEqual([{ from: 341 + KEPT_GAP / 2, rows: 775 - 341 - KEPT_GAP }])
  })

  it('leaves a stretch no longer than the gap it keeps, such as between lines of text', () => {
    expect(keptRowCuts(kept([300, 310], [311 + KEPT_GAP, 330]), 300, 331)).toEqual([])
    expect(keptRowCuts(kept([300, 310], [312 + KEPT_GAP, 330]), 300, 331)).toHaveLength(1)
  })

  it('is null when no row is kept', () => {
    expect(keptRowCuts(kept([100, 200]), 292, 896)).toBeNull()
  })
})

describe('rowsNotInBaseline', () => {
  /**
   * A shot's row signatures: blank except the given [from, to, element] runs, where each element
   * fills its own eight cells, so two elements share nothing.
   */
  const signatures = (...runs: [number, number, number][]) => {
    const rows = Array.from({ length: WINDOW.height }, () => new Uint8Array(SIGNATURE_CELLS / 8))
    for (const [from, to, element] of runs) {
      for (let y = from; y <= to; y++) rows[y]?.fill(0xff, element, element + 1)
    }
    return rows
  }
  const keptRuns = (kept: readonly boolean[]) =>
    kept.flatMap((k, y) => (k && !kept[y - 1] ? [[y, kept.indexOf(false, y) - 1]] : []))

  it('keeps an element the baseline does not have', () => {
    const shot = signatures([100, 120, 1], [200, 240, 2])
    const baseline = signatures([100, 120, 1])

    expect(keptRuns(rowsNotInBaseline(shot, baseline, PROMPT_BOX.y))).toEqual([[200, 240]])
  })

  it("leaves out an element that only moved down, pushed by the mod's drawing above it", () => {
    const shot = signatures([100, 140, 2], [180, 200, 1])
    const baseline = signatures([120, 140, 1])

    expect(keptRuns(rowsNotInBaseline(shot, baseline, PROMPT_BOX.y))).toEqual([[100, 140]])
  })

  it('matches a row that differs only in a few cells, as antialiasing does', () => {
    const baseline = signatures([100, 120, 1])
    const shot = signatures([140, 160, 1])
    for (let y = 140; y <= 160; y++) shot[y]?.fill((1 << SIGNATURE_TOLERANCE) - 1, 3, 4)

    expect(keptRuns(rowsNotInBaseline(shot, baseline, PROMPT_BOX.y))).toEqual([])
  })

  it('keeps a row that differs in more cells than that, as different text does', () => {
    const baseline = signatures([100, 120, 1])
    const shot = signatures([100, 120, 1])
    for (let y = 100; y <= 120; y++) shot[y]?.fill((1 << (SIGNATURE_TOLERANCE + 1)) - 1, 3, 4)

    expect(keptRuns(rowsNotInBaseline(shot, baseline, PROMPT_BOX.y))).toEqual([[100, 120]])
  })

  it('never keeps a blank row', () => {
    const shot = signatures()
    const baseline = signatures([100, 120, 1])

    expect(keptRuns(rowsNotInBaseline(shot, baseline, PROMPT_BOX.y))).toEqual([])
  })

  it('compares the rows from the bottom of the chat down at the same height, as Desktop fixes them there', () => {
    const prompt: [number, number, number] = [PROMPT_BOX.y, PROMPT_BOX.y + 39, 4]
    // A band's plate and the prompt box are both content edge to edge, so their rows look alike.
    const shot = signatures([775, 814, 4], prompt)
    const baseline = signatures(prompt)

    expect(keptRuns(rowsNotInBaseline(shot, baseline, 775))).toEqual([[775, 814]])
  })
})
