import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseFootprint, parseManifest } from '@/mods/plugin-facts'

/** `claude plugin validate --json` for hellosverre/claude-skins, captured in the #38 spike. */
const skinsValidate = JSON.parse(
  readFileSync(new URL('./fixtures/validate-skins.json', import.meta.url), 'utf8'),
)

describe('parseFootprint', () => {
  it('reads the events and calls from the validate notes', () => {
    const { events, calls } = parseFootprint(skinsValidate)

    expect(events).toHaveLength(22)
    expect(events).toEqual(
      expect.arrayContaining([
        'session.start',
        'classic.SessionStart{source=clear|resume|fork}',
        'tool.call{tool=/"^mcp__skins__design$"/}',
        'ui.render{component=Pane, requestId=skins-settings}',
        'ui.render{component=AbovePrompt}',
      ]),
    )
    expect(calls).toEqual([
      '$.clock.after',
      '$.clock.every',
      '$.clock.now',
      '$.command.register',
      '$.command.run',
      '$.config.list',
      '$.env.get',
      '$.fs.read',
      '$.http.fetch',
      '$.process.run',
      '$.session.cwd',
      '$.session.usage',
      '$.state.get',
      '$.state.set',
      '$.store.get',
      '$.store.set',
      '$.tool.register',
      '$.ui.copy',
      '$.ui.log',
      '$.ui.open',
      '$.ui.resolve',
      '$.ui.toast',
    ])
  })

  const validateWith = (notes: string[]) => ({ success: true, contents: [{ notes }] })
  const named = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${i}`)

  it('keeps 200 events and calls of 200 characters each', () => {
    const events = [...named('e', 199), 'e'.repeat(200)].sort()
    const calls = [...named('$.c', 199), `$.${'c'.repeat(198)}`].sort()
    const footprint = parseFootprint(
      validateWith([`./a.ts hooks: ${events.join(', ')}`, `./a.ts calls: ${calls.join(', ')}`]),
    )

    expect(footprint).toEqual({ events, calls })
  })

  it.each([
    ['201 events', [`./a.ts hooks: ${named('e', 201).join(', ')}`], /201 events; at most 200/],
    ['201 calls', [`./a.ts calls: ${named('$.c', 201).join(', ')}`], /201 calls; at most 200/],
    [
      'an event of 201 characters',
      [`./a.ts hooks: ${'e'.repeat(201)}`],
      /events longer than 200 characters/,
    ],
    [
      'a call of 201 characters',
      [`./a.ts calls: $.${'c'.repeat(199)}`],
      /calls longer than 200 characters/,
    ],
  ])('refuses %s', (_name, notes, message) => {
    expect(() => parseFootprint(validateWith(notes))).toThrow(message)
  })

  it('is empty for a plugin with no hook modules', () => {
    expect(parseFootprint({ success: true, contents: [] })).toEqual({ events: [], calls: [] })
  })
})

describe('parseManifest', () => {
  it('reads the name, version and description', () => {
    const text = JSON.stringify({ name: 'skins', version: '1.2.0', description: 'Reskins it.' })

    expect(parseManifest(text)).toEqual({
      name: 'skins',
      version: '1.2.0',
      description: 'Reskins it.',
    })
  })

  it('leaves a missing version null and a missing description empty', () => {
    expect(parseManifest('{"name":"skins"}')).toEqual({
      name: 'skins',
      version: null,
      description: '',
    })
  })

  it('keeps a name of 100, a version of 64 and a description of 1000 characters', () => {
    const manifest = {
      name: 'n'.repeat(100),
      version: 'v'.repeat(64),
      description: 'd'.repeat(1000),
    }

    expect(parseManifest(JSON.stringify(manifest))).toEqual(manifest)
  })

  it.each([
    ['name', { name: 'n'.repeat(101) }, /name must be at most 100 characters/],
    [
      'version',
      { name: 'skins', version: 'v'.repeat(65) },
      /version must be at most 64 characters/,
    ],
    [
      'description',
      { name: 'skins', description: 'd'.repeat(1001) },
      /description must be at most 1000 characters/,
    ],
  ])('refuses a %s past its limit', (_name, manifest, message) => {
    expect(() => parseManifest(JSON.stringify(manifest))).toThrow(message)
  })

  const unprintable: [string, string][] = [
    ['ESC', '\u001b[2J'],
    ['a bidi override', '\u202e'],
    ['U+2028', '\u2028'],
    ['NUL', '\u0000'],
  ]
  it.each(
    ['name', 'version', 'description'].flatMap((field) =>
      unprintable.map(([what, char]): [string, string, string] => [field, what, char]),
    ),
  )('refuses a %s containing %s, escaped in the error', (field, _what, char) => {
    const manifest = { name: 'skins', [field]: `a${char}b` }
    const codePoint = `U+${(char.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0')}`

    expect(() => parseManifest(JSON.stringify(manifest))).toThrow(
      `${field} must not contain control or format characters (${codePoint})`,
    )
    expect(() => parseManifest(JSON.stringify(manifest))).not.toThrow(char)
  })

  it('keeps ordinary spaces and printable unicode', () => {
    const manifest = {
      name: 'skins für Claude',
      version: '1.0.0 β',
      description: 'Reskins it 🎨 — 日本語 and Ünïcödé, tabs aside.',
    }

    expect(parseManifest(JSON.stringify(manifest))).toEqual(manifest)
  })

  it.each([
    ['not JSON', 'nope'],
    ['no name', '{"version":"1.0.0"}'],
  ])('refuses a plugin.json that is %s', (_name, text) => {
    expect(() => parseManifest(text)).toThrow(/plugin\.json/)
  })
})
