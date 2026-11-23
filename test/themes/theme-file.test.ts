import { describe, expect, it } from 'vitest'
import { parseTerminalThemeFiles } from '@/themes/theme-file'

const file = (key: string, text: string) => ({ key, bytes: new TextEncoder().encode(text) })
const json = (key: string, value: unknown) => file(key, JSON.stringify(value))

const problems = (files: ReturnType<typeof file>[]) => {
  const result = parseTerminalThemeFiles(files)
  return result.ok ? [] : result.problems
}

describe('parseTerminalThemeFiles', () => {
  it('reads each file into a theme, keeping its exact text, sorted by key', () => {
    const amber =
      '{\n  "name": "Amber 1982",\n  "base": "light",\n  "overrides": { "claude": "#ffb000" }\n}\n'

    expect(parseTerminalThemeFiles([file('zinc', '{}'), file('amber-1982', amber)])).toEqual({
      ok: true,
      themes: [
        { key: 'amber-1982', name: 'Amber 1982', window: 'light', source: amber },
        { key: 'zinc', name: 'zinc', window: 'dark', source: '{}' },
      ],
    })
  })

  it.each([
    ['dark', 'dark'],
    ['light-daltonized', 'light'],
    ['dark-ansi', 'dark'],
    ['light-ansi', 'light'],
  ])('draws a theme on base %s in a %s window', (base, window) => {
    const result = parseTerminalThemeFiles([json('t', { base })])

    expect(result.ok && result.themes[0]?.window).toBe(window)
  })

  it('keeps $schema, a name of 64 characters and printable unicode', () => {
    const name = `Ünïcödé 日本 ${'n'.repeat(53)}`
    const result = parseTerminalThemeFiles([json('t', { $schema: 'https://x.example', name })])

    expect(name).toHaveLength(64)
    expect(result.ok && result.themes[0]?.name).toBe(name)
  })

  it.each([
    ['a base Claude Code has no such theme for', { base: 'solarized' }, 'themes/t.json: base'],
    ['a field a theme file does not have', { name: 'T', colors: {} }, 'themes/t.json: "colors"'],
    ['an empty name', { name: '' }, 'themes/t.json: name'],
    ['a name of 65 characters', { name: 'n'.repeat(65) }, 'themes/t.json: name'],
    ['a name that is not text', { name: 7 }, 'themes/t.json: name'],
    ['overrides that are not an object', { overrides: ['#fff'] }, 'themes/t.json: overrides'],
    ['a color that is not text', { overrides: { claude: 0xffffff } }, 'overrides.claude'],
    ['a color of 65 characters', { overrides: { claude: 'c'.repeat(65) } }, 'overrides.claude'],
    ['a token of 65 characters', { overrides: { [`t${'o'.repeat(64)}`]: '#fff' } }, 'overrides'],
  ])('refuses %s, naming the file', (_name, value, message) => {
    expect(problems([json('t', value)]).join('\n')).toContain(message)
  })

  it.each([
    ['a right-to-left override', '‮'],
    ['a zero-width space', '​'],
    ['an escape', '\u001b[2J'],
  ])('refuses a name or color carrying %s, and never echoes it', (_what, char) => {
    for (const value of [{ name: `a${char}b` }, { overrides: { claude: `#fff${char}` } }]) {
      const found = problems([json('t', value)]).join('\n')

      expect(found).toContain('must not contain control or format characters')
      expect(found).not.toContain(char)
    }
  })

  it('names an unknown field or token it cannot print safely without echoing it', () => {
    const found = problems([json('t', { 'x‮y': 1, overrides: { 'to​ken': '#fff' } })]).join('\n')

    expect(found).toContain('themes/t.json')
    expect(found).not.toContain('‮')
    expect(found).not.toContain('​')
  })

  it.each([
    ['not JSON', file('t', '{"name": ')],
    ['a JSON array', file('t', '[]')],
    [
      'not UTF-8',
      {
        key: 't',
        bytes: new Uint8Array([...new TextEncoder().encode('{"name":"a'), 0xff, 0x22, 0x7d]),
      },
    ],
  ])('refuses a file that is %s', (_name, bad) => {
    expect(problems([bad]).join('\n')).toMatch(/^themes\/t\.json /)
  })

  it('refuses two files whose names match ignoring case, as /theme picks a theme by name', () => {
    const found = problems([json('a', { name: 'Ocean' }), json('b', { name: 'OCEAN' })])

    expect(found).toEqual([
      'themes/a.json and themes/b.json are both named "Ocean" (ignoring case), and /theme picks a theme by its name',
    ])
  })

  it("counts a file's default name, its key, against the others", () => {
    expect(problems([json('ocean', {}), json('b', { name: 'Ocean' })])).toHaveLength(1)
  })

  it('reports every bad file at once', () => {
    expect(problems([json('a', { base: 'x' }), json('b', { extra: 1 })])).toHaveLength(2)
  })
})
