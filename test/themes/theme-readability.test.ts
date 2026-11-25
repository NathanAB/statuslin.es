import { describe, expect, it } from 'vitest'
import { TERMINAL_THEME_BASES } from '@/themes/theme'
import { parseTerminalThemeFiles } from '@/themes/theme-file'

const theme = (value: unknown) => ({
  key: 't',
  bytes: new TextEncoder().encode(JSON.stringify(value)),
})

const problems = (value: unknown) => {
  const result = parseTerminalThemeFiles([theme(value)])
  return result.ok ? [] : result.problems
}

describe('a terminal theme that hides the permission prompt or diffs', () => {
  it.each(TERMINAL_THEME_BASES)("passes Claude Code's own %s colors", (base) => {
    expect(problems({ base })).toEqual([])
  })

  it('flags a permission prompt drawn in black on a dark terminal', () => {
    expect(problems({ base: 'dark', overrides: { permission: '#000000' } })).toEqual([
      'themes/t.json: the permission prompt is unreadable: "permission" #000000 on the terminal\'s background (black, as the theme is for a dark window) has a contrast ratio of 1.00:1, under 3:1',
    ])
  })

  it('flags text drawn in white on a light terminal', () => {
    expect(problems({ base: 'light', overrides: { text: 'rgb(255,255,255)' } })).toContain(
      'themes/t.json: text, such as the command a permission prompt asks about, is unreadable: "text" rgb(255,255,255) on the terminal\'s background (white, as the theme is for a light window) has a contrast ratio of 1.00:1, under 3:1',
    )
  })

  it('flags an added line whose text matches its background', () => {
    expect(problems({ base: 'dark', overrides: { text: '#eee', diffAdded: '#eeeeee' } })).toEqual([
      'themes/t.json: an added line in a diff is unreadable: "text" #eee on "diffAdded" #eeeeee has a contrast ratio of 1.00:1, under 3:1',
    ])
  })

  it('flags a removed line against the base text color the theme keeps', () => {
    // The dark base's text is white, so a white removed line hides it.
    expect(problems({ base: 'dark', overrides: { diffRemoved: '#fff' } })).toEqual([
      'themes/t.json: a removed line in a diff is unreadable: "text" rgb(255,255,255) on "diffRemoved" #fff has a contrast ratio of 1.00:1, under 3:1',
    ])
  })

  it.each([
    // xterm gray 88 on black: (0.0976 + 0.05) / 0.05, about 2.95.
    ['ansi256(240)', 1],
    // Gray 98 on black: (0.1221 + 0.05) / 0.05, about 3.44.
    ['ansi256(241)', 0],
  ])(
    'draws the line at 3:1: permission %s on a dark terminal gives %i problems',
    (permission, count) => {
      expect(problems({ base: 'dark', overrides: { permission } })).toHaveLength(count)
    },
  )

  it("flags added and removed lines drawn in each other's colors", () => {
    // Claude Code's own dark removed and added line colors, swapped.
    expect(
      problems({ base: 'dark', overrides: { diffAdded: '#7a2936', diffRemoved: '#225c2b' } }),
    ).toEqual([
      'themes/t.json: added lines in a diff are red ("diffAdded" #7a2936), the color of removed lines, so a diff reads backwards',
      'themes/t.json: removed lines in a diff are green ("diffRemoved" #225c2b), the color of added lines, so a diff reads backwards',
    ])
  })

  it('takes a gray or a blue added line as it is', () => {
    expect(
      problems({ base: 'dark', overrides: { diffAdded: '#3a3a3a', diffRemoved: '#00446a' } }),
    ).toEqual([])
  })

  it.each([
    // Black and white are black and white in every terminal palette worth the name.
    ['dark', 'permission', 'ansi:black'],
    ['dark', 'permission', 'ansi256(0)'],
    ['light', 'text', 'ansi:whiteBright'],
    ['light', 'text', 'ansi256(15)'],
  ])("flags a %s theme whose %s is the terminal's own %s", (base, token, value) => {
    expect(problems({ base, overrides: { [token]: value } }).join()).toContain(
      `"${token}" ${value} on the terminal's background`,
    )
  })

  it("flags added and removed lines in the terminal's own red and green, swapped", () => {
    expect(
      problems({
        base: 'dark-ansi',
        overrides: { diffAdded: 'ansi:redBright', diffRemoved: 'ansi256(2)' },
      }),
    ).toEqual([
      'themes/t.json: added lines in a diff are red ("diffAdded" ansi:redBright), the color of removed lines, so a diff reads backwards',
      'themes/t.json: removed lines in a diff are green ("diffRemoved" ansi256(2)), the color of added lines, so a diff reads backwards',
    ])
  })

  it.each([['rgb(0 0 0)'], ['#000000ff'], ['black'], ['ansi:purple'], ['RGB(0,0,0)']])(
    'refuses a permission or diff color it cannot check: %s',
    (value) => {
      expect(problems({ base: 'dark', overrides: { permission: value } })).toEqual([
        `themes/t.json: "permission" ${value} is not a color statuslin.es can check; the permission prompt and diffs take #rrggbb, #rgb, rgb(r,g,b), ansi256(n) or ansi:<name>`,
      ])
    },
  )

  it("leaves an ANSI theme's black and white to the palette it is made for, as Gruvbox Light (ANSI) does", () => {
    // A light palette maps white to a dark gray, so white text on a light terminal can read.
    expect(problems({ base: 'light-ansi', overrides: { text: 'ansi:whiteBright' } })).toEqual([])
    // Only red and green are judged among the rest, and by name.
    expect(
      problems({
        base: 'dark-ansi',
        overrides: {
          permission: 'ansi:black',
          text: 'ansi:white',
          diffAdded: 'ansi256(4)',
          diffRemoved: 'ansi:magenta',
        },
      }),
    ).toEqual([])
  })
})
