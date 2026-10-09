import { describe, expect, it } from 'vitest'
import { DRAW_LOCATION_LABEL, describeFootprint, describeModFootprint } from '@/mods/footprint'

// filetree's real footprint, from the render spike (spike/results/summary.md).
const FILETREE = {
  events: [
    'classic.CwdChanged',
    'command.run{command=filetree}',
    'session.start',
    'tool.call{tool=Read}',
    'ui.focus{component=Pane, requestId=filetree}',
    'ui.render{component=Pane, requestId=filetree}',
  ],
  calls: [
    '$.clock.after',
    '$.fs.list',
    '$.fs.read',
    '$.process.run',
    '$.session.cwd',
    '$.state.get',
    '$.ui.open',
    '$.ui.resolve',
    '$.ui.toast',
  ],
}

describe('describeFootprint', () => {
  it('turns a real footprint into plain-words lines, most sensitive first', () => {
    expect(describeFootprint(FILETREE).phrases).toEqual([
      'runs programs',
      'reads files',
      'adds the /filetree command',
      'watches Read tool calls',
      'runs on a timer',
      'reacts to classic hook events',
    ])
  })

  it('names each place the mod draws, once, in a fixed order', () => {
    const { draws } = describeFootprint({
      events: [
        'ui.render{component=PromptHint}',
        'ui.render{component=Pane, requestId=a}',
        'ui.render{component=AbovePrompt}',
        'ui.render{component=Spinner}',
        'ui.render{component=Pane, requestId=b}',
      ],
      calls: ['$.ui.status', '$.ui.toast', '$.ui.open'],
    })
    expect(draws.map((d) => DRAW_LOCATION_LABEL[d])).toEqual([
      'above the prompt',
      'under the prompt',
      'a pane',
      'a status entry',
      'a toast',
      'built-in rows',
    ])
  })

  it('shows an entry it does not know verbatim instead of dropping it', () => {
    const result = describeFootprint({
      events: ['session.start', 'weather.change{city=Oslo}'],
      calls: ['$.fs.read', '$.teleport.now'],
    })
    expect(result.phrases).toEqual(['reads files'])
    expect(result.unknown).toEqual(['weather.change{city=Oslo}', '$.teleport.now'])
  })

  it('says nothing about plumbing every mod uses', () => {
    const result = describeFootprint({
      events: ['session.start', 'turn.complete'],
      calls: ['$.state.get', '$.state.set', '$.ui.resolve', '$.ui.invalidate', '$.clock.now'],
    })
    expect(result).toEqual({ phrases: [], unknown: [], draws: [], mentionsDesktop: false })
  })

  it('keeps a matcher it cannot read as plain words generic', () => {
    const { phrases } = describeFootprint({
      events: ['tool.call{tool=/"^mcp__skins__design$"/}', 'command.run'],
      calls: [],
    })
    expect(phrases).toEqual(['adds slash commands', 'watches tool calls'])
  })

  it('notices an entry that targets the Desktop surface', () => {
    expect(
      describeFootprint({
        events: ['ui.render{component=AbovePrompt, surface=desktop}'],
        calls: [],
      }).mentionsDesktop,
    ).toBe(true)
  })
})

describe('describeModFootprint', () => {
  const PLAIN = { events: ['ui.render{component=AbovePrompt}'], calls: [] }
  const PREVIEW = [{ text: 'row' }]

  it('is the terminal for a mod with a terminal preview', () => {
    expect(
      describeModFootprint({ footprint: PLAIN, preview: PREVIEW, desktopScreenshot: null })
        .surfaces,
    ).toEqual(['terminal'])
  })

  it('is Desktop alone for a mod shown only by a Desktop screenshot', () => {
    expect(
      describeModFootprint({ footprint: PLAIN, preview: null, desktopScreenshot: '/shot.png' })
        .surfaces,
    ).toEqual(['desktop'])
  })

  it('adds Desktop when the footprint targets it', () => {
    const footprint = { events: ['ui.render{component=AbovePrompt, surface=desktop}'], calls: [] }
    expect(
      describeModFootprint({ footprint, preview: PREVIEW, desktopScreenshot: null }).surfaces,
    ).toEqual(['terminal', 'desktop'])
  })

  it('carries the plain-words footprint alongside the surfaces', () => {
    const described = describeModFootprint({
      footprint: FILETREE,
      preview: PREVIEW,
      desktopScreenshot: null,
    })
    expect(described).toMatchObject(describeFootprint(FILETREE))
  })
})
