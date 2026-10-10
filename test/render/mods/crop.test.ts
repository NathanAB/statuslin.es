import { describe, expect, it } from 'vitest'
import { type CropResult, cropModPreview, type RowMask } from '@/render/mods/crop'
import type { AnsiSegment } from '@/render/types'
import baseline from './fixtures/baseline.json'
import skins from './fixtures/skins.json'
import switchboard from './fixtures/switchboard.json'
import tokenWeather from './fixtures/token-weather.json'

const BRANDING = /▐▛|▜▌|▝▜|▛███|Claude Code|Anthropic|claude\.com|API Usage Billing/
const SKINS_COMPLETION_WORD: RowMask = {
  name: 'skins completion word',
  pattern: /\p{Lu}\p{Ll}+ in \d+s/u,
  replacement: 'WORD in Ns',
}

function renderedSegments(result: CropResult): AnsiSegment[] {
  if (result.kind !== 'rendered') throw new Error(`expected a rendered crop, got ${result.kind}`)
  return result.segments
}

function lines(result: CropResult): string[] {
  return renderedSegments(result)
    .map((s) => s.text)
    .join('')
    .split('\n')
}

describe('cropModPreview', () => {
  it('keeps a band drawn above the prompt with its styles, and the prompt row', () => {
    const result = cropModPreview(baseline, tokenWeather)

    expect(lines(result).map((line) => line.trimEnd())).toEqual([
      ' ☀  Clear  22% of context  44k / 200k   last turns ██  steady                                   [-]',
      '❯',
    ])
    expect(renderedSegments(result)).toContainEqual(
      expect.objectContaining({ text: '☀  Clear', fg: 'rgb(245, 217, 10)', bold: true }),
    )
  })

  it('drops rows that only moved because the mod scrolled the transcript', () => {
    const kept = lines(cropModPreview(baseline, switchboard))

    expect(kept[0]).toBe('❯ /route ')
    expect(kept).toHaveLength(11)
    expect(kept).not.toContain('● The repo is clean and the tests pass.')
    expect(kept.some((line) => line.startsWith('❯ hello'))).toBe(false)
  })

  it('never keeps the baseline branding rows, even when they scrolled', () => {
    expect(switchboard[0]).toMatch(BRANDING)

    for (const screen of [tokenWeather, switchboard, skins]) {
      for (const line of lines(cropModPreview(baseline, screen))) expect(line).not.toMatch(BRANDING)
    }
  })

  it('is not rendered when only the turn-duration verb and clock differ', () => {
    const turnRow = baseline.findIndex((row) => row.includes('Churned for 0s · done 9:48 PM'))
    const sameSession = baseline.map((row, y) =>
      y === turnRow
        ? row.replace('Churned for 0s · done 9:48 PM', 'Cogitated for 0s · done 10:02 AM')
        : row,
    )

    expect(cropModPreview(baseline, sameSession)).toEqual({ kind: 'not-rendered' })
  })

  it('applies a per-mod mask to hide a random word difference', () => {
    const otherRun = skins.map((row) => row.replace('Settled in 16s', 'Done in 16s'))

    expect(lines(cropModPreview(skins, otherRun))).toContain('◆ Done in 16s')
    expect(cropModPreview(skins, otherRun, [SKINS_COMPLETION_WORD])).toEqual({
      kind: 'not-rendered',
    })
  })

  it('masks only the comparison, so the kept rows show the real text', () => {
    expect(lines(cropModPreview(baseline, skins, [SKINS_COMPLETION_WORD]))).toContain(
      '◆ Settled in 16s',
    )
  })

  it('is not rendered when only the prompt row is left', () => {
    const recoloredCursor = baseline.map((row) => row.replace('\x1b[0;30;47m', '\x1b[0;30;46m'))
    expect(recoloredCursor.filter((row, y) => row !== baseline[y])).toEqual([
      '❯\u00a0\x1b[0;30;46m \x1b[0m',
    ])

    expect(cropModPreview(baseline, recoloredCursor)).toEqual({ kind: 'not-rendered' })
    expect(cropModPreview(baseline, baseline)).toEqual({ kind: 'not-rendered' })
  })
})
