import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CURATION_FILE, parseCuration } from '@/mods/curation'
import { MAX_INPUT_STEPS, MAX_STEP_CHARS } from '@/render/mods/desktop/drive'
import { MAX_TERMINAL_COLS, MAX_TERMINAL_ROWS, TERMINAL } from '@/render/mods/terminal'

const SHA = 'a'.repeat(40)

const entry = (overrides: Record<string, unknown> = {}) => ({
  repoUrl: 'https://github.com/octocat/meter',
  path: 'mods/meter',
  commitSha: SHA,
  pluginName: 'meter',
  title: 'Meter',
  ...overrides,
})

function errorsFor(entries: unknown[]): string[] {
  const result = parseCuration(entries)
  if (result.ok) throw new Error('expected the curation file to be refused')
  return result.errors
}

describe('parseCuration', () => {
  it('accepts a clean entry and defaults its input steps to none', () => {
    expect(parseCuration([entry()])).toEqual({
      ok: true,
      entries: [{ ...entry(), inputSteps: [] }],
    })
  })

  it('keeps text input steps, including one typed without Enter', () => {
    const inputSteps = [
      { type: 'text', text: '/radar' },
      { type: 'text', text: 'look at [Image #1]', submit: false },
    ]

    const result = parseCuration([entry({ inputSteps })])

    expect(result.ok && result.entries[0]?.inputSteps).toEqual(inputSteps)
  })

  it("keeps click steps on the recording terminal's corner cells", () => {
    const inputSteps = [
      { type: 'click', row: 1, col: 1 },
      { type: 'click', row: TERMINAL.rows, col: TERMINAL.cols },
    ]

    const result = parseCuration([entry({ inputSteps })])

    expect(result.ok && result.entries[0]?.inputSteps).toEqual(inputSteps)
  })

  it.each([
    ['row 0', { row: 0 }, /inputSteps\.0\.row/],
    ['a row below the terminal', { row: TERMINAL.rows + 1 }, /inputSteps\.0\.row/],
    ['column 0', { col: 0 }, /inputSteps\.0\.col/],
    ['a column past the terminal', { col: TERMINAL.cols + 1 }, /inputSteps\.0\.col/],
    ['half a row', { row: 2.5 }, /inputSteps\.0\.row/],
    ['text to type as well', { text: 'w' }, /inputSteps\.0.*text/],
  ])('refuses a click step with %s', (_name, overrides, message) => {
    const inputSteps = [{ type: 'click', row: 21, col: 50, ...overrides }]

    const errors = errorsFor([entry({ inputSteps })])

    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatch(message)
  })

  it.each([
    ['a short SHA', { commitSha: 'abc1234' }, /commitSha.*40/],
    ['an uppercase SHA', { commitSha: 'A'.repeat(40) }, /commitSha.*40/],
    ['a non-https URL', { repoUrl: 'http://github.com/octocat/meter' }, /repoUrl.*https/],
    ['a non-GitHub URL', { repoUrl: 'https://gitlab.com/octocat/meter' }, /repoUrl.*github/],
    ['a .git URL', { repoUrl: 'https://github.com/octocat/meter.git' }, /repoUrl.*\.git/],
    ['a plugin name with a space', { pluginName: 'my meter' }, /pluginName/],
    ['a plugin name starting with a dot', { pluginName: '.meter' }, /pluginName/],
    ['a path segment starting with "-"', { path: 'mods/-meter' }, /path.*"-"/],
    ['a ".." path segment', { path: 'mods/../meter' }, /path/],
    ['a trailing slash in the path', { path: 'mods/meter/' }, /path/],
    ['an empty title', { title: ' ' }, /title/],
    ['a card surface other than the terminal', { cardSurface: 'desktop' }, /cardSurface/],
    [
      'a terminal narrower than the default',
      { terminal: { cols: TERMINAL.cols - 1, fullscreen: true } },
      /terminal\.cols/,
    ],
    [
      'a terminal shorter than the default',
      { terminal: { cols: TERMINAL.cols, rows: TERMINAL.rows - 1, fullscreen: true } },
      /terminal\.rows/,
    ],
    [
      'a terminal taller than the recording caps allow',
      { terminal: { cols: TERMINAL.cols, rows: MAX_TERMINAL_ROWS + 1, fullscreen: true } },
      /terminal\.rows/,
    ],
    [
      'a terminal wider than the recording caps allow',
      { terminal: { cols: MAX_TERMINAL_COLS + 1, fullscreen: true } },
      /terminal\.cols/,
    ],
    [
      'a hand-made Desktop screenshot, which render:mods now records',
      { desktopScreenshot: '/mods/meter.png' },
      /desktopScreenshot/,
    ],
  ])('refuses %s', (_name, overrides, message) => {
    const errors = errorsFor([entry(overrides)])

    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatch(message)
  })

  it("keeps an entry's Desktop themes, each with no switch steps unless it names some", () => {
    const desktopThemes = [
      {
        key: 'night-reef',
        name: 'Night Reef',
        window: 'dark',
        switchSteps: ['/custom-theme night-reef'],
      },
      { key: 'rainy-window', name: 'Rainy Window', window: 'light' },
    ]

    const result = parseCuration([entry({ desktopThemes })])

    expect(result.ok && result.entries[0]?.desktopThemes).toEqual([
      desktopThemes[0],
      { ...desktopThemes[1], switchSteps: [] },
    ])
  })

  const desktopTheme = (overrides: Record<string, unknown> = {}) => ({
    key: 'night-reef',
    name: 'Night Reef',
    window: 'dark',
    switchSteps: ['/custom-theme night-reef'],
    ...overrides,
  })

  it.each([
    ['a key with a space', { key: 'night reef' }, /desktopThemes\.0\.key/],
    ['a key over 64 characters', { key: 'k'.repeat(65) }, /desktopThemes\.0\.key/],
    ['an empty name', { name: '' }, /desktopThemes\.0\.name/],
    ['a name over 64 characters', { name: 'N'.repeat(65) }, /desktopThemes\.0\.name/],
    [
      'a name with a format character',
      { name: 'Night\u202eReef' },
      /desktopThemes\.0\.name.*format/,
    ],
    [
      'a name mixing Latin and Cyrillic',
      { name: 'Night R\u0435\u0435f' },
      /desktopThemes\.0\.name.*Cyrillic/,
    ],
    ['a window that is neither light nor dark', { window: 'dim' }, /desktopThemes\.0\.window/],
    ['an empty switch step', { switchSteps: [''] }, /desktopThemes\.0\.switchSteps\.0/],
    [
      'a switch step too long to type',
      { switchSteps: ['x'.repeat(MAX_STEP_CHARS + 1)] },
      /desktopThemes\.0\.switchSteps\.0/,
    ],
    [
      'more switch steps than a Desktop recording fits',
      { switchSteps: Array.from({ length: MAX_INPUT_STEPS + 1 }, () => '/x') },
      /desktopThemes\.0\.switchSteps/,
    ],
  ])('refuses a Desktop theme with %s', (_name, overrides, message) => {
    const errors = errorsFor([entry({ desktopThemes: [desktopTheme(overrides)] })])

    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatch(message)
  })

  it.each([
    ['key', [desktopTheme(), desktopTheme({ name: 'Night Reef 2' })], /key "night-reef"/],
    [
      'name',
      [desktopTheme(), desktopTheme({ key: 'reef-2', name: 'night reef' })],
      /named "Night Reef"/,
    ],
  ])('refuses two Desktop themes with one %s', (_what, desktopThemes, message) => {
    const errors = errorsFor([entry({ desktopThemes })])

    expect(errors).toEqual([expect.stringMatching(message)])
  })

  it('names the entry an error belongs to', () => {
    const errors = errorsFor([entry(), entry({ pluginName: 'gauge', commitSha: 'abc' })])

    expect(errors[0]).toMatch(/entry 2 \(gauge\)/)
  })

  it('refuses a plugin name used twice in the file', () => {
    const errors = errorsFor([entry(), entry({ path: 'mods/meter-2' })])

    expect(errors).toEqual([expect.stringMatching(/entry 2 \(meter\).*"meter".*entry 1/)])
  })

  it('refuses a file that is not a list', () => {
    expect(errorsFor({ mods: [] } as unknown as unknown[])).toHaveLength(1)
  })

  it('parses the committed curation file', () => {
    const result = parseCuration(JSON.parse(readFileSync(CURATION_FILE, 'utf8')))

    expect(result.ok ? [] : result.errors).toEqual([])
  })
})
