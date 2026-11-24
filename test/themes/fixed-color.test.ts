import { describe, expect, it } from 'vitest'
import { fixedColorWindow } from '@/themes/fixed-color'

describe('fixedColorWindow', () => {
  it.each([
    // xterm gray ramp: 8 + 10 * (252 - 232) = 208, relative luminance about 0.63.
    ['ansi256(252)', 'light'],
    // Cube index 215 is (5, 5, 5): level 255 on every channel, white.
    ['ansi256(231)', 'light'],
    // Gray 8 + 10 * 5 = 58, relative luminance about 0.042.
    ['ansi256(237)', 'dark'],
    // Gray 68, relative luminance about 0.058.
    ['ansi256(238)', 'dark'],
    // Cube index 0 is (0, 0, 0): black.
    ['ansi256(16)', 'dark'],
    ['#fff', 'light'],
    ['#000', 'dark'],
    ['#FFFFFF', 'light'],
    ['#3a3a3a', 'dark'],
    ['rgb(250,250,250)', 'light'],
    ['rgb(20,20,20)', 'dark'],
  ])('reads %s as a %s window', (value, window) => {
    expect(fixedColorWindow(value)).toBe(window)
  })

  it.each([
    // The 16 colors the user's terminal sets, by number or by name.
    ['ansi256(7)'],
    ['ansi256(15)'],
    ['ansi:white'],
    ['ansi:black'],
    // Not a color Claude Code reads.
    ['white'],
    ['#ffff'],
    ['rgb(256,0,0)'],
    ['ansi256(256)'],
    [''],
  ])('reads no window from %s', (value) => {
    expect(fixedColorWindow(value)).toBeUndefined()
  })

  it('reads no window from a missing value', () => {
    expect(fixedColorWindow(undefined)).toBeUndefined()
  })
})
