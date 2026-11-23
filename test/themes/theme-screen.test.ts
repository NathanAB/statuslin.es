import { describe, expect, it } from 'vitest'
import type { AnsiSegment } from '@/render/types'
import { themeScreenPreview } from '@/themes/theme-screen'
import runOne from './fixtures/probe-theme-run-1.json'
import runTwo from './fixtures/probe-theme-run-2.json'

const RESET = '\u001b[0m'
const fg = (rgb: string) => `\u001b[0;38;2;${rgb}m`
const PURPLE = '189;147;249'
const SLATE = '119;136;153'

function segment(text: string, style: Partial<AnsiSegment> = {}): AnsiSegment {
  return { text, fg: null, bg: null, bold: false, italic: false, underline: false, ...style }
}

const turnRow = (verb: string, time: string) =>
  `${fg(SLATE)}✻${RESET} ${fg(SLATE)}${verb} · done ${time}${RESET}`

describe('themeScreenPreview', () => {
  it("keeps the whole screen in the theme's colours, Claude Code's branding rows included", () => {
    const screen = [
      '',
      `${fg(PURPLE)} ▐▛███▜▌${RESET}   \u001b[0;1mClaude Code${RESET}`,
      `${fg('68;85;102')}────${RESET}`,
      '❯ hello',
    ]

    expect(themeScreenPreview(screen)).toEqual([
      segment('\n'),
      segment(' ▐▛███▜▌', { fg: 'rgb(189, 147, 249)' }),
      segment('   '),
      segment('Claude Code', { bold: true }),
      segment('\n'),
      segment('────', { fg: 'rgb(68, 85, 102)' }),
      segment('\n❯ hello'),
    ])
  })

  it("stores one preview for two recordings that differ only in the turn's verb, its time and the effort hint", () => {
    const effortHint = `${' '.repeat(80)}${fg(SLATE)}◐ medium · /effort${RESET}`
    const first = ['● Done.', turnRow('Crunched for 0s', '9:11 PM'), effortHint, '❯']
    const second = ['● Done.', turnRow('Cogitated for 1s', '10:02 PM'), '', '❯']

    const preview = themeScreenPreview(first)

    expect(themeScreenPreview(second)).toEqual(preview)
    expect(preview).toEqual([
      segment('● Done.\n'),
      segment('✻', { fg: 'rgb(119, 136, 153)' }),
      segment(' '),
      segment('Worked for 1s · done 9:41 AM', { fg: 'rgb(119, 136, 153)' }),
      segment('\n\n❯'),
    ])
  })

  it('stores one preview for two real recordings of one theme', () => {
    expect(runOne).not.toEqual(runTwo)

    expect(themeScreenPreview(runTwo)).toEqual(themeScreenPreview(runOne))
  })

  it('trims the blank rows after the last row that shows something, keeping blank rows above it', () => {
    const screen = ['', 'a', '', 'b', '', '   ', `${fg(SLATE)}  ${RESET}`]

    expect(themeScreenPreview(screen)).toEqual([segment('\na\n\nb')])
  })
})
