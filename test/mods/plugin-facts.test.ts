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

  it.each([
    ['not JSON', 'nope'],
    ['no name', '{"version":"1.0.0"}'],
  ])('refuses a plugin.json that is %s', (_name, text) => {
    expect(() => parseManifest(text)).toThrow(/plugin\.json/)
  })
})
