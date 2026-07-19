import { describe, expect, it } from 'vitest'
import { splitSegmentsIntoLines } from '@/og/card'
import type { AnsiSegment } from '@/render/types'

const seg = (text: string, fg: string | null = null, bold = false): AnsiSegment => ({
  text,
  fg,
  bg: null,
  bold,
  italic: false,
  underline: false,
})

const asText = (lines: AnsiSegment[][]): string[] =>
  lines.map((line) => line.map((s) => s.text).join(''))

describe('splitSegmentsIntoLines', () => {
  it('keeps a single-line status line as one line', () => {
    const lines = splitSegmentsIntoLines([seg('app'), seg(' · '), seg('main')])
    expect(lines).toHaveLength(1)
    expect(asText(lines)).toEqual(['app · main'])
  })

  it('splits a mid-segment newline into two lines, preserving per-segment styling', () => {
    const lines = splitSegmentsIntoLines([seg('top', 'rgb(1,2,3)', true), seg('a\nb'), seg('end')])
    expect(asText(lines)).toEqual(['topa', 'bend'])
    // The first segment's color/bold survive the split.
    expect(lines[0]?.[0]).toMatchObject({ text: 'top', fg: 'rgb(1,2,3)', bold: true })
  })

  it('preserves an interior blank line from a "\\n\\n" segment as a spacer', () => {
    const lines = splitSegmentsIntoLines([seg('top'), seg('\n\n'), seg('bottom')])
    expect(asText(lines)).toEqual(['top', '', 'bottom'])
  })

  it('drops leading and trailing blank lines from stray wrapping newlines', () => {
    // Real status lines wrap their output in a leading newline and trailing "\n\n"; those must not
    // become visible blank rows (that is the "giant gap" at the top/bottom of the card).
    const lines = splitSegmentsIntoLines([seg('\n'), seg('  hi '), seg('there'), seg('\n\n')])
    expect(asText(lines)).toEqual(['  hi there'])
  })

  it('groups each visual line’s segments together', () => {
    const lines = splitSegmentsIntoLines([seg('a'), seg('b'), seg('\n'), seg('c'), seg('d')])
    expect(lines).toHaveLength(2)
    expect(asText(lines)).toEqual(['ab', 'cd'])
  })

  it('handles a five-line render (the usage-dot-bars shape) as five lines', () => {
    // Leading newline + 5 content lines + trailing "\n\n", the exact shape of a real multi-line
    // status line: five visible rows, no leading/trailing blanks.
    const lines = splitSegmentsIntoLines([
      seg('\n'),
      seg('Opus 4.8'),
      seg('\n'),
      seg('Session ●●●'),
      seg('\n'),
      seg('Weekly ●●●'),
      seg('\n'),
      seg('Read:index.ts'),
      seg('\n'),
      seg('code-reviewer'),
      seg('\n\n'),
    ])
    expect(asText(lines)).toEqual([
      'Opus 4.8',
      'Session ●●●',
      'Weekly ●●●',
      'Read:index.ts',
      'code-reviewer',
    ])
  })
})
