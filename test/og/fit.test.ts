import { createElement } from 'react'
import satori from 'satori'
import { describe, expect, it } from 'vitest'
import { cellWidth, fitFontSize, fitWithin, lineHeight } from '@/og/fit'
import { cardSatoriOptions } from '@/og/render'

describe('cellWidth', () => {
  it('counts one cell per character of ASCII, box drawing and blocks', () => {
    expect(cellWidth('ctx 22%')).toBe(7)
    expect(cellWidth('╭──╮ █░')).toBe(7)
  })

  it('counts two cells for wide CJK characters and for pictographs satori draws as emoji', () => {
    expect(cellWidth('日本')).toBe(4)
    expect(cellWidth('☀ 44k')).toBe(6)
  })

  it('counts nothing for combining marks and joiners', () => {
    expect(cellWidth('é')).toBe(1)
    expect(cellWidth('☀️')).toBe(2)
  })
})

describe('fitFontSize', () => {
  it('keeps the largest size when every line fits', () => {
    expect(fitFontSize([['short'], ['lines']], 19, 1016)).toBe(19)
  })

  it('shrinks the size until the widest line fits the width, at 0.6em a cell', () => {
    const size = fitFontSize([['x'.repeat(40)], ['x'.repeat(100)]], 19, 1016)

    expect(size).toBeLessThan(19)
    expect(100 * 0.6 * size + 1).toBeLessThanOrEqual(1016)
    expect(100 * 0.6 * (size + 0.01) + 1).toBeGreaterThan(1016)
  })

  // satori rounds each span's width up to a whole pixel, so a line of many colored spans draws
  // wider than its cells alone.
  it('leaves a pixel per span of the line', () => {
    const spans = Array.from({ length: 16 }, () => 'x'.repeat(6))
    const size = fitFontSize([spans], 19, 1016)

    expect(96 * 0.6 * size + 16).toBeLessThanOrEqual(1016)
    expect(96 * 0.6 * (size + 0.01) + 16).toBeGreaterThan(1016)
  })

  it('keeps the largest size for no lines at all', () => {
    expect(fitFontSize([], 19, 1016)).toBe(19)
  })
})

describe('fitWithin', () => {
  it('scales a wide image to the width of the box, keeping its aspect ratio', () => {
    expect(fitWithin({ width: 784, height: 129 }, { width: 1056, height: 250 })).toEqual({
      width: 1056,
      height: 173,
    })
  })

  it('scales a tall image to the height of the box, keeping its aspect ratio', () => {
    expect(fitWithin({ width: 356, height: 800 }, { width: 1056, height: 250 })).toEqual({
      width: 111,
      height: 250,
    })
  })
})

describe('lineHeight', () => {
  it.each([10, 17.43, 19, 24, 30, 54])(
    'matches the height satori lays out a line of %spx text at',
    async (fontSize) => {
      const heights: number[] = []
      const line = createElement(
        'div',
        { style: { display: 'flex', fontFamily: 'StatuslineNerd', fontSize } },
        'ctx 22%',
      )
      await satori(line, {
        ...cardSatoriOptions(),
        onNodeDetected: (node) => heights.push(node.height),
      })
      expect(lineHeight(fontSize)).toBe(heights[0])
    },
  )
})
